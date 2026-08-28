import { findDuplicateSourceHeaders } from './schema.ts';
import type {
  ColumnMapping,
  ImportSchema,
  ParsedImportRow,
  ValidationSeverity,
} from './types.ts';

export type ValidationIssue = {
  rowNumber: number;
  fieldName: string;
  errorCode: string;
  errorMessage: string;
  severity: ValidationSeverity;
  originalValue: string | null;
};

export type ImportValidationResult = {
  issues: ValidationIssue[];
  successRows: number;
  warningRows: number;
  errorRows: number;
  canImport: boolean;
};

type ValidateImportRowsInput = {
  schema: ImportSchema;
  mapping: ColumnMapping;
  rows: readonly ParsedImportRow[];
  knownItemIds: ReadonlySet<string>;
  knownSupplierIds: ReadonlySet<string>;
};

const dateFields = new Set([
  'use_date',
  'as_of_date',
  'order_date',
  'due_date',
  'receipt_date',
  'requested_date',
  'event_date',
]);

const numberFields = new Set([
  'qty',
  'current_stock',
  'safety_stock',
  'standard_price',
  'standard_lead_time_days',
  'unit_price',
  'line_no',
]);

const dateRelationships: Partial<Record<ImportSchema['type'], readonly [string, string]>> = {
  purchase_order: ['order_date', 'due_date'],
  sales_order: ['order_date', 'requested_date'],
};

export function validateImportRows({
  schema,
  mapping,
  rows,
  knownItemIds,
  knownSupplierIds,
}: ValidateImportRowsInput): ImportValidationResult {
  const issues = validateMapping(schema, mapping, rows);
  if (issues.some((validationIssue) => validationIssue.severity === 'ERROR')) {
    return {
      issues,
      successRows: 0,
      warningRows: 0,
      errorRows: rows.length,
      canImport: false,
    };
  }

  const rowSeverities = new Map<number, Set<ValidationSeverity>>();

  for (const issue of issues) {
    addSeverity(rowSeverities, issue);
  }

  for (const row of rows) {
    const rowIssues = validateRow({ schema, mapping, row, knownItemIds, knownSupplierIds });
    issues.push(...rowIssues);
    for (const issue of rowIssues) {
      addSeverity(rowSeverities, issue);
    }
  }

  issues.push(...validateDuplicates(schema, mapping, rows));
  for (const issue of issues) {
    addSeverity(rowSeverities, issue);
  }

  const dataRowSeverities = rows.map((row) => rowSeverities.get(row.rowNumber) ?? new Set<ValidationSeverity>());
  return {
    issues,
    successRows: dataRowSeverities.filter((severities) => severities.size === 0).length,
    warningRows: dataRowSeverities.filter((severities) => severities.has('WARNING') && !severities.has('ERROR')).length,
    errorRows: dataRowSeverities.filter((severities) => severities.has('ERROR')).length,
    canImport: !issues.some((issue) => issue.severity === 'ERROR'),
  };
}

function validateMapping(
  schema: ImportSchema,
  mapping: ColumnMapping,
  rows: readonly ParsedImportRow[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const availableHeaders = new Set(rows.flatMap((row) => Object.keys(row.values)));
  const schemaFields = new Set(schema.fields.map((field) => field.standardField));
  const knownMappings = Object.entries(mapping).filter(([fieldName]) => schemaFields.has(fieldName));

  for (const [fieldName, sourceHeader] of Object.entries(mapping)) {
    if (!schemaFields.has(fieldName)) {
      issues.push(issue(1, fieldName, 'UNKNOWN_STANDARD_FIELD_MAPPING', '이 Import 타입에 없는 표준 필드입니다.', 'ERROR', sourceHeader));
    }
  }

  for (const fieldName of schema.requiredFields) {
    if (!mapping[fieldName]) {
      issues.push(issue(1, fieldName, 'REQUIRED_MAPPING_MISSING', '필수 표준 필드 ' + fieldName + '의 원본 컬럼 매핑을 확인해야 합니다.', 'ERROR', null));
    }
  }

  for (const [fieldName, sourceHeader] of knownMappings) {
    if (!availableHeaders.has(sourceHeader)) {
      issues.push(issue(1, fieldName, 'MAPPING_SOURCE_HEADER_NOT_FOUND', '매핑한 원본 컬럼을 파일에서 찾을 수 없습니다.', 'ERROR', sourceHeader));
    }
  }

  const duplicateHeaders = new Set(findDuplicateSourceHeaders(Object.fromEntries(knownMappings)));
  for (const [fieldName, sourceHeader] of knownMappings) {
    if (duplicateHeaders.has(sourceHeader)) {
      issues.push(issue(1, fieldName, 'DUPLICATE_SOURCE_HEADER_MAPPING', '하나의 원본 컬럼은 하나의 표준 필드에만 매핑해야 합니다.', 'ERROR', sourceHeader));
    }
  }

  return issues;
}

function validateRow({
  schema,
  mapping,
  row,
  knownItemIds,
  knownSupplierIds,
}: Omit<ValidateImportRowsInput, 'rows'> & { row: ParsedImportRow }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of schema.fields) {
    const sourceHeader = mapping[field.standardField];
    if (!sourceHeader) {
      continue;
    }

    const originalValue = row.values[sourceHeader] ?? null;
    const value = originalValue?.trim() ?? '';
    if (schema.requiredFields.includes(field.standardField) && value.length === 0) {
      issues.push(issue(row.rowNumber, field.standardField, 'REQUIRED_VALUE_MISSING', '필수값이 비어 있습니다.', 'ERROR', originalValue));
      continue;
    }

    if (value.length === 0) {
      continue;
    }

    if (numberFields.has(field.standardField) && !isValidNumber(value)) {
      issues.push(issue(row.rowNumber, field.standardField, 'INVALID_NUMBER', '숫자 형식이 아닙니다.', 'ERROR', originalValue));
      continue;
    }

    if (dateFields.has(field.standardField) && !isValidDate(value)) {
      issues.push(issue(row.rowNumber, field.standardField, 'INVALID_DATE', 'YYYY-MM-DD 형식의 실제 날짜가 아닙니다.', 'ERROR', originalValue));
      continue;
    }

    if (field.standardField === 'qty' && Number(value) < 0) {
      if (schema.type === 'business_event') {
        issues.push(issue(row.rowNumber, field.standardField, 'NEGATIVE_QUANTITY_REVIEW_REQUIRED', '음수 이벤트 수량은 반품·조정 여부를 확인해야 합니다.', 'WARNING', originalValue));
      } else {
        issues.push(issue(row.rowNumber, field.standardField, 'FORBIDDEN_NEGATIVE_QUANTITY', '음수 수량은 적재할 수 없습니다.', 'ERROR', originalValue));
      }
    }

    if (schema.itemReferenceFields.includes(field.standardField) && !knownItemIds.has(value)) {
      issues.push(issue(row.rowNumber, field.standardField, 'UNKNOWN_ITEM', '품목 마스터에서 찾을 수 없는 품목입니다.', 'ERROR', originalValue));
    }

    if (schema.supplierReferenceFields.includes(field.standardField) && !knownSupplierIds.has(value)) {
      issues.push(issue(row.rowNumber, field.standardField, 'UNKNOWN_SUPPLIER', '공급처 마스터에서 찾을 수 없는 공급처입니다.', 'ERROR', originalValue));
    }
  }

  const relationship = dateRelationships[schema.type];
  if (relationship) {
    const [startField, endField] = relationship;
    const startValue = mappedValue(row, mapping, startField);
    const endValue = mappedValue(row, mapping, endField);
    if (startValue && endValue && isValidDate(startValue) && isValidDate(endValue) && startValue > endValue) {
      issues.push(issue(row.rowNumber, endField, 'INVALID_DATE_RELATIONSHIP', `${endField}은 ${startField}보다 이를 수 없습니다.`, 'ERROR', row.values[mapping[endField]!] ?? null));
    }
  }

  return issues;
}

function validateDuplicates(schema: ImportSchema, mapping: ColumnMapping, rows: readonly ParsedImportRow[]): ValidationIssue[] {
  const seenNaturalKeys = new Set<string>();
  const issues: ValidationIssue[] = [];

  for (const row of rows) {
    const values = schema.naturalKey.map((fieldName) => mappedValue(row, mapping, fieldName));
    if (values.some((value) => !value)) {
      continue;
    }

    const key = values.join('\u0000');
    if (seenNaturalKeys.has(key)) {
      issues.push(issue(row.rowNumber, schema.naturalKey.join(','), 'DUPLICATE_NATURAL_KEY', '파일 안에 같은 자연키를 가진 행이 있습니다.', 'ERROR', key));
    } else {
      seenNaturalKeys.add(key);
    }
  }

  return issues;
}

function mappedValue(row: ParsedImportRow, mapping: ColumnMapping, fieldName: string): string | null {
  const sourceHeader = mapping[fieldName];
  const value = sourceHeader ? row.values[sourceHeader] : null;
  return value?.trim() || null;
}

function isValidNumber(value: string): boolean {
  return Number.isFinite(Number(value));
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function issue(
  rowNumber: number,
  fieldName: string,
  errorCode: string,
  errorMessage: string,
  severity: ValidationSeverity,
  originalValue: string | null,
): ValidationIssue {
  return { rowNumber, fieldName, errorCode, errorMessage, severity, originalValue };
}

function addSeverity(severitiesByRow: Map<number, Set<ValidationSeverity>>, validationIssue: ValidationIssue): void {
  const severities = severitiesByRow.get(validationIssue.rowNumber) ?? new Set<ValidationSeverity>();
  severities.add(validationIssue.severity);
  severitiesByRow.set(validationIssue.rowNumber, severities);
}
