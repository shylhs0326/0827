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
  uploaded_by_email: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
};

export type ImportPreview = {
  totalRows: number;
  headers: string[];
  rows: ParsedImportRow[];
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
  return `\uFEFF${[headers, ...values].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n')}`;
}

/** 브라우저 전송량을 제한하기 위해 preview는 원본 헤더와 첫 20행만 반환한다. */
export function buildPreviewSample(rows: readonly ParsedImportRow[], limit = 20): ImportPreview {
  return {
    totalRows: rows.length,
    headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row.values)))),
    rows: rows.slice(0, limit),
  };
}

export async function stageImport(formData: FormData): Promise<{ batchId: string; mapping: ColumnMapping; totalRows: number; preview: ImportPreview }> {
  const { supabase, user } = await requireImportAdmin();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new Error('IMPORT_FILE_REQUIRED');
  }

  const importType = readImportType(formData.get('importType'));
  const importMode = readImportMode(formData.get('importMode'));
  const rows = await parseImportFile(file, importType);
  // 자동 매핑은 Preview 제안값일 뿐, 사용자가 검증 단계에서 확정하기 전에는 저장하지 않는다.
  const mapping = suggestColumnMapping(importType, Array.from(new Set(rows.flatMap((row) => Object.keys(row.values)))));

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

  try {
    const stagingRows = rows.map((row) => buildPreviewStagingRow(batch.batch_id, row));
    await insertInChunks(supabase.schema('core').from('import_staging'), stagingRows);
  } catch (error) {
    await markBatchFailed(supabase, batch.batch_id as string, error);
    throw error;
  }

  return { batchId: batch.batch_id as string, mapping, totalRows: rows.length, preview: buildPreviewSample(rows) };
}

export async function validateBatch(batchId: string, mappingValue?: unknown): Promise<ImportBatchSummary> {
  const { supabase, user } = await requireImportAdmin();
  const batch = await getBatchForMutation(supabase, batchId);
  if (batch.status !== 'PARSED') {
    throw new Error('IMPORT_BATCH_NOT_PARSE_READY');
  }

  const schema = getImportSchema(batch.import_type);
  const staging = await getStagingRows(supabase, batchId);
  const rows = staging.map(toParsedRow);
  const mapping = readConfirmedMapping(mappingValue);
  const references = await loadImportReferences(supabase, schema);
  const validation = validateImportRows({ schema, mapping, rows, knownItemIds: references.knownItemIds, knownSupplierIds: references.knownSupplierIds });
  const naturalKeyIssues = findNaturalKeyIssues(schema, mapping, rows);
  const issues = [...validation.issues, ...naturalKeyIssues, ...(references.reasonCode ? unavailableTargetIssues(rows, references.reasonCode) : [])];
  const rowStatuses = buildRowStatuses(rows, issues);
  const counts = countRowStatuses(rowStatuses);

  try {
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
    if (errors.length > 0) await insertInChunks(supabase.schema('core').from('validation_error'), errors);

    for (const rowGroup of chunks(rows, 500)) {
      await Promise.all(rowGroup.map(async (row) => {
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
      }));
    }

    const mappingRows = Object.entries(mapping).map(([standardField, sourceHeader]) => ({
      import_type: batch.import_type, source_header: sourceHeader, standard_field: standardField,
      raw_column: schema.fields.find((field) => field.standardField === standardField)?.rawColumn ?? standardField,
      created_by: user.id, updated_at: new Date().toISOString(),
    }));
    if (mappingRows.length > 0) await upsertInChunks(supabase.schema('core').from('column_mapping'), mappingRows, 'import_type,source_header');
    const { data, error } = await supabase.schema('core').from('upload_batch').update({
    success_rows: counts.successRows,
    warning_rows: counts.warningRows,
    error_rows: counts.errorRows,
    status: 'VALIDATED',
  }).eq('batch_id', batchId).select(importBatchColumns).single();
    throwOnSupabaseError(error);
    return data as ImportBatchSummary;
  } catch (error) {
    await markBatchFailed(supabase, batchId, error);
    throw error;
  }
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
    p_replace_confirmation: replaceConfirmation ?? null,
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

export async function getImportHistoryForAdmin(): Promise<ImportBatchSummary[]> {
  const { supabase } = await requireImportAdmin();
  const { data, error } = await supabase.schema('core').from('import_batch_summary')
    .select(importBatchColumns)
    .order('uploaded_at', { ascending: false });
  throwOnSupabaseError(error);
  return (data ?? []) as ImportBatchSummary[];
}

const importBatchColumns = 'batch_id,file_name,import_type,import_mode,total_rows,success_rows,warning_rows,error_rows,status,rollback_supported,uploaded_by_email,uploaded_by_name,uploaded_at';

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

function readConfirmedMapping(value: unknown): ColumnMapping {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isStringRecord(parsed)) return parsed;
    } catch {
      throw new Error('COLUMN_MAPPING_INVALID');
    }
    throw new Error('COLUMN_MAPPING_INVALID');
  }
  throw new Error('COLUMN_MAPPING_CONFIRMATION_REQUIRED');
}

function buildPreviewStagingRow(batchId: string, row: ParsedImportRow) {
  return {
    batch_id: batchId,
    row_number: row.rowNumber,
    original_data: row.values,
    normalized_data: null,
    source_record_id: null,
    mapping_confirmed: false,
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

async function loadImportReferences(supabase: any, schema: ImportSchema): Promise<{ knownItemIds: Set<string>; knownSupplierIds: Set<string>; reasonCode: string | null }> {
  const { data, error } = await supabase.schema('core').rpc('get_import_reference_data', { p_import_type: schema.type });
  throwOnSupabaseError(error);
  const payload = isUnknownRecord(data) ? data : {};
  return {
    knownItemIds: new Set(readStringList(payload.known_item_ids)),
    knownSupplierIds: new Set(readStringList(payload.known_supplier_ids)),
    reasonCode: payload.target_available === true ? null : typeof payload.reason_code === 'string' ? payload.reason_code : 'IMPORT_TARGET_UNAVAILABLE',
  };
}

function unavailableTargetIssues(rows: readonly ParsedImportRow[], reasonCode: string): ValidationIssue[] {
  return rows.map((row) => ({ rowNumber: row.rowNumber, fieldName: 'import_type', errorCode: reasonCode,
    errorMessage: '현재 RAW 대상 또는 참조 마스터를 사용할 수 없어 적재할 수 없습니다.', severity: 'ERROR' as const, originalValue: null }));
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
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function insertInChunks(query: any, rows: readonly Record<string, unknown>[]): Promise<void> {
  for (const group of chunks(rows, 500)) {
    const { error } = await query.insert(group);
    throwOnSupabaseError(error);
  }
}

async function upsertInChunks(query: any, rows: readonly Record<string, unknown>[], onConflict: string): Promise<void> {
  for (const group of chunks(rows, 500)) {
    const { error } = await query.upsert(group, { onConflict });
    throwOnSupabaseError(error);
  }
}

async function markBatchFailed(supabase: any, batchId: string, failure: unknown): Promise<void> {
  const message = failure instanceof Error ? failure.message : 'IMPORT_PIPELINE_FAILED';
  await supabase.schema('core').from('upload_batch').update({ status: 'FAILED', failure_code: 'IMPORT_PIPELINE_FAILED', failure_message: message }).eq('batch_id', batchId);
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && Object.values(value).every((entry) => typeof entry === 'string');
}

function throwOnSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
