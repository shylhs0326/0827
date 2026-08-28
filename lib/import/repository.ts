import 'server-only';

import { parseImportFile } from './parse.ts';
import { getImportSchema, suggestColumnMapping } from './schema.ts';
import { isImportType, type ColumnMapping, type ImportMode, type ImportSchema, type ImportType, type ParsedImportRow, type ValidationSeverity } from './types.ts';
import { validateImportRows, type ValidationIssue } from './validate.ts';

type BatchStatus = 'PARSED' | 'VALIDATED' | 'IMPORTED' | 'ROLLED_BACK' | 'FAILED';

export type ImportBatchGate = { status: string; errorRows: number };
export type RollbackBatchGate = { mode: string; status: string; rollbackSupported: boolean };
export type ErrorCsvRow = {
  rowNumber: number;
  originalData: Record<string, unknown>;
  errorCode: string;
  errorMessage: string;
  severity: 'WARNING' | 'ERROR';
};

export type ImportBatchSummary = {
  batch_id: string;
  file_name: string;
  import_type: ImportType;
  import_mode: ImportMode;
  total_rows: number;
  success_rows: number;
  warning_rows: number;
  error_rows: number;
  status: BatchStatus;
  rollback_supported: boolean;
  uploaded_at: string;
};

type StagingRow = {
  row_number: number;
  original_data: Record<string, unknown>;
  normalized_data: Record<string, unknown> | null;
  source_record_id: string | null;
};

export function canApproveImport(batch: ImportBatchGate): boolean {
  return batch.status === 'VALIDATED' && batch.errorRows === 0;
}

export function canRollbackImport(batch: RollbackBatchGate): boolean {
  return batch.status === 'IMPORTED' && batch.mode !== 'replace' && batch.rollbackSupported;
}

/** 자연키는 파일 위치가 아니라 업무 식별값만으로 source_record_id를 만든다. */
export function buildSourceRecordId(type: ImportType, values: readonly (string | null | undefined)[]): string | null {
  if (values.some((value) => !value?.trim())) {
    return null;
  }

  return `${type}:${values.map((value) => encodeURIComponent(value!.trim())).join(':')}`;
}

export function buildErrorCsv(rows: readonly ErrorCsvRow[]): string {
  const originalHeaders = Array.from(new Set(rows.flatMap((row) => Object.keys(row.originalData))));
  const headers = [...originalHeaders, 'row_number', 'error_code', 'error_message', 'severity'];
  const values = rows.map((row) => [
    ...originalHeaders.map((header) => stringifyCsvValue(row.originalData[header])),
    String(row.rowNumber),
    row.errorCode,
    row.errorMessage,
    row.severity,
  ]);
  return [headers, ...values].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

export async function stageImport(formData: FormData): Promise<{ batchId: string; mapping: ColumnMapping; totalRows: number }> {
  const { supabase, user } = await requireImportAdmin();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new Error('IMPORT_FILE_REQUIRED');
  }

  const importType = readImportType(formData.get('importType'));
  const importMode = readImportMode(formData.get('importMode'));
  const rows = await parseImportFile(file, importType);
  const mapping = readMapping(formData.get('mapping'), importType, rows);
  const schema = getImportSchema(importType);

  const { data: batch, error: batchError } = await supabase.schema('core').from('upload_batch').insert({
    file_name: file.name,
    import_type: importType,
    import_mode: importMode,
    total_rows: rows.length,
    uploaded_by: user.id,
    status: 'PARSED',
  }).select('batch_id').single();
  throwOnSupabaseError(batchError);
  if (!batch) throw new Error('IMPORT_BATCH_CREATE_FAILED');

  const stagingRows = rows.map((row) => buildStagingRow(batch.batch_id, schema, mapping, row));
  const { error: stagingError } = await supabase.schema('core').from('import_staging').insert(stagingRows);
  throwOnSupabaseError(stagingError);

  const mappingRows = Object.entries(mapping).map(([standardField, sourceHeader]) => ({
    import_type: importType,
    source_header: sourceHeader,
    standard_field: standardField,
    raw_column: schema.fields.find((field) => field.standardField === standardField)?.rawColumn ?? standardField,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }));
  if (mappingRows.length > 0) {
    const { error: mappingError } = await supabase.schema('core').from('column_mapping')
      .upsert(mappingRows, { onConflict: 'import_type,source_header' });
    throwOnSupabaseError(mappingError);
  }

  return { batchId: batch.batch_id as string, mapping, totalRows: rows.length };
}

export async function validateBatch(batchId: string, mappingValue?: unknown): Promise<ImportBatchSummary> {
  const { supabase } = await requireImportAdmin();
  const batch = await getBatchForMutation(supabase, batchId);
  if (batch.status !== 'PARSED') {
    throw new Error('IMPORT_BATCH_NOT_PARSE_READY');
  }

  const schema = getImportSchema(batch.import_type);
  const staging = await getStagingRows(supabase, batchId);
  const rows = staging.map(toParsedRow);
  const mapping = readMapping(mappingValue, batch.import_type, rows);
  const { knownItemIds, knownSupplierIds } = await loadKnownMasterIds(supabase, schema);
  const validation = validateImportRows({ schema, mapping, rows, knownItemIds, knownSupplierIds });
  const naturalKeyIssues = findNaturalKeyIssues(schema, mapping, rows);
  const issues = [...validation.issues, ...naturalKeyIssues];
  const rowStatuses = buildRowStatuses(rows, issues);
  const counts = countRowStatuses(rowStatuses);

  const { error: clearError } = await supabase.schema('core').from('validation_error').delete().eq('batch_id', batchId);
  throwOnSupabaseError(clearError);

  const errors = issues.filter((issue) => issue.severity !== 'SUCCESS').map((issue) => ({
    batch_id: batchId,
    row_number: issue.rowNumber,
    field_name: issue.fieldName,
    error_code: issue.errorCode,
    error_message: issue.errorMessage,
    severity: issue.severity,
    original_value: issue.originalValue,
  }));
  if (errors.length > 0) {
    const { error } = await supabase.schema('core').from('validation_error').insert(errors);
    throwOnSupabaseError(error);
  }

  for (const row of rows) {
    const normalizedData = normalizeRow(schema, mapping, row);
    const sourceRecordId = buildSourceRecordId(schema.type, schema.naturalKey.map((field) => mappedValue(row, mapping, field)));
    const { error } = await supabase.schema('core').from('import_staging').update({
      normalized_data: normalizedData,
      source_record_id: sourceRecordId,
      mapping_confirmed: true,
      validation_status: rowStatuses.get(row.rowNumber),
      validated_at: new Date().toISOString(),
    }).eq('batch_id', batchId).eq('row_number', row.rowNumber);
    throwOnSupabaseError(error);
  }

  const { data, error } = await supabase.schema('core').from('upload_batch').update({
    success_rows: counts.successRows,
    warning_rows: counts.warningRows,
    error_rows: counts.errorRows,
    status: 'VALIDATED',
  }).eq('batch_id', batchId).select(importBatchColumns).single();
  throwOnSupabaseError(error);
  return data as ImportBatchSummary;
}

export async function approveImport(batchId: string, replaceConfirmation?: string): Promise<ImportBatchSummary> {
  const { supabase } = await requireImportAdmin();
  const batch = await getBatchForMutation(supabase, batchId);
  if (!canApproveImport({ status: batch.status, errorRows: batch.error_rows })) {
    throw new Error('IMPORT_BATCH_NOT_APPROVABLE');
  }
  if (batch.import_mode === 'replace' && replaceConfirmation !== 'REPLACE') {
    throw new Error('REPLACE_CONFIRMATION_REQUIRED');
  }

  const { data, error } = await supabase.schema('core').rpc('import_approved_batch', {
    p_batch_id: batchId,
    replace_confirmation: replaceConfirmation ?? null,
  });
  throwOnSupabaseError(error);
  return data as ImportBatchSummary;
}

export async function rollbackBatch(batchId: string): Promise<ImportBatchSummary> {
  const { supabase } = await requireImportAdmin();
  const batch = await getBatchForMutation(supabase, batchId);
  if (!canRollbackImport({ mode: batch.import_mode, status: batch.status, rollbackSupported: batch.rollback_supported })) {
    throw new Error('IMPORT_BATCH_NOT_ROLLBACK_READY');
  }

  const { data, error } = await supabase.schema('core').rpc('rollback_import_batch', { p_batch_id: batchId });
  throwOnSupabaseError(error);
  return data as ImportBatchSummary;
}

export async function getValidationErrors(batchId: string): Promise<ErrorCsvRow[]> {
  const { supabase } = await requireImportAdmin();
  const { data: errors, error } = await supabase.schema('core').from('validation_error')
    .select('row_number,error_code,error_message,severity')
    .eq('batch_id', batchId)
    .order('row_number');
  throwOnSupabaseError(error);
  const staging = await getStagingRows(supabase, batchId);
  const originalByRow = new Map(staging.map((row) => [row.row_number, row.original_data]));
  return (errors ?? []).map((row) => ({
    rowNumber: row.row_number as number,
    originalData: originalByRow.get(row.row_number as number) ?? {},
    errorCode: row.error_code as string,
    errorMessage: row.error_message as string,
    severity: row.severity as 'WARNING' | 'ERROR',
  }));
}

export async function getErrorCsv(batchId: string): Promise<string> {
  await requireImportAdmin();
  return buildErrorCsv(await getValidationErrors(batchId));
}

const importBatchColumns = 'batch_id,file_name,import_type,import_mode,total_rows,success_rows,warning_rows,error_rows,status,rollback_supported,uploaded_at';

async function requireImportAdmin() {
  const { requireAdmin } = await import('../auth.ts');
  return requireAdmin();
}

function readImportType(value: FormDataEntryValue | null): ImportType {
  if (typeof value !== 'string' || !isImportType(value)) throw new Error('IMPORT_TYPE_INVALID');
  return value;
}

function readImportMode(value: FormDataEntryValue | null): ImportMode {
  if (value === 'append' || value === 'upsert' || value === 'replace') return value;
  throw new Error('IMPORT_MODE_INVALID');
}

function readMapping(value: unknown, importType: ImportType, rows: readonly ParsedImportRow[]): ColumnMapping {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isStringRecord(parsed)) return parsed;
    } catch {
      throw new Error('COLUMN_MAPPING_INVALID');
    }
    throw new Error('COLUMN_MAPPING_INVALID');
  }
  return suggestColumnMapping(importType, Array.from(new Set(rows.flatMap((row) => Object.keys(row.values)))));
}

function buildStagingRow(batchId: string, schema: ImportSchema, mapping: ColumnMapping, row: ParsedImportRow) {
  const normalizedData = normalizeRow(schema, mapping, row);
  return {
    batch_id: batchId,
    row_number: row.rowNumber,
    original_data: row.values,
    normalized_data: normalizedData,
    source_record_id: buildSourceRecordId(schema.type, schema.naturalKey.map((field) => mappedValue(row, mapping, field))),
    mapping_confirmed: true,
  };
}

function normalizeRow(schema: ImportSchema, mapping: ColumnMapping, row: ParsedImportRow): Record<string, string | null> {
  return Object.fromEntries(schema.fields.flatMap((field) => {
    const sourceHeader = mapping[field.standardField];
    return sourceHeader ? [[field.rawColumn, row.values[sourceHeader] ?? null]] : [];
  }));
}

async function getBatchForMutation(supabase: any, batchId: string): Promise<ImportBatchSummary> {
  const { data, error } = await supabase.schema('core').from('upload_batch').select(importBatchColumns).eq('batch_id', batchId).single();
  throwOnSupabaseError(error);
  return data as ImportBatchSummary;
}

async function getStagingRows(supabase: any, batchId: string): Promise<StagingRow[]> {
  const { data, error } = await supabase.schema('core').from('import_staging')
    .select('row_number,original_data,normalized_data,source_record_id').eq('batch_id', batchId).order('row_number');
  throwOnSupabaseError(error);
  return (data ?? []) as StagingRow[];
}

function toParsedRow(row: StagingRow): ParsedImportRow {
  return {
    rowNumber: row.row_number,
    values: Object.fromEntries(Object.entries(row.original_data).map(([key, value]) => [key, value == null ? null : String(value)])),
  };
}

async function loadKnownMasterIds(supabase: any, schema: ImportSchema): Promise<{ knownItemIds: Set<string>; knownSupplierIds: Set<string> }> {
  const knownItemIds = new Set<string>();
  const knownSupplierIds = new Set<string>();
  if (schema.itemReferenceFields.length > 0) {
    const { data, error } = await supabase.schema('raw').from('item_master').select('품목코드');
    throwOnSupabaseError(error);
    for (const row of data ?? []) if (row.품목코드 != null) knownItemIds.add(String(row.품목코드));
  }
  if (schema.supplierReferenceFields.length > 0) {
    const { data, error } = await supabase.schema('raw').from('supplier_master').select('공급업체코드,공급업체명');
    throwOnSupabaseError(error);
    for (const row of data ?? []) {
      if (row.공급업체코드 != null) knownSupplierIds.add(String(row.공급업체코드));
      if (row.공급업체명 != null) knownSupplierIds.add(String(row.공급업체명));
    }
  }
  return { knownItemIds, knownSupplierIds };
}

function findNaturalKeyIssues(schema: ImportSchema, mapping: ColumnMapping, rows: readonly ParsedImportRow[]): ValidationIssue[] {
  return rows.flatMap((row) => schema.naturalKey.flatMap((fieldName) => {
    if (mappedValue(row, mapping, fieldName)) return [];
    return [{
      rowNumber: row.rowNumber,
      fieldName,
      errorCode: 'NATURAL_KEY_VALUE_MISSING',
      errorMessage: 'source_record_id를 만들기 위한 자연키 값이 비어 있습니다.',
      severity: 'ERROR' as const,
      originalValue: null,
    }];
  }));
}

function buildRowStatuses(rows: readonly ParsedImportRow[], issues: readonly ValidationIssue[]): Map<number, ValidationSeverity> {
  const status = new Map(rows.map((row) => [row.rowNumber, 'SUCCESS' as ValidationSeverity]));
  const hasGlobalError = issues.some((issue) => issue.rowNumber === 1 && issue.severity === 'ERROR');
  for (const row of rows) {
    if (hasGlobalError) status.set(row.rowNumber, 'ERROR');
  }
  for (const issue of issues) {
    if (!status.has(issue.rowNumber)) continue;
    if (issue.severity === 'ERROR') status.set(issue.rowNumber, 'ERROR');
    else if (issue.severity === 'WARNING' && status.get(issue.rowNumber) !== 'ERROR') status.set(issue.rowNumber, 'WARNING');
  }
  return status;
}

function countRowStatuses(statuses: ReadonlyMap<number, ValidationSeverity>) {
  return Array.from(statuses.values()).reduce((counts, status) => ({
    successRows: counts.successRows + Number(status === 'SUCCESS'),
    warningRows: counts.warningRows + Number(status === 'WARNING'),
    errorRows: counts.errorRows + Number(status === 'ERROR'),
  }), { successRows: 0, warningRows: 0, errorRows: 0 });
}

function mappedValue(row: ParsedImportRow, mapping: ColumnMapping, fieldName: string): string | null {
  const header = mapping[fieldName];
  const value = header ? row.values[header] : null;
  return value?.trim() || null;
}

function stringifyCsvValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function escapeCsvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && Object.values(value).every((entry) => typeof entry === 'string');
}

function throwOnSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
