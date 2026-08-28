import assert from 'node:assert/strict';
import test from 'node:test';
import { getImportSchema } from './schema.ts';
import { validateImportRows } from './validate.ts';

const usageMapping = {
  item_id: '품목코드',
  use_date: '출고일',
  qty: '출고수량',
  warehouse: '창고',
};

test('필수값 누락, 잘못된 날짜, 알 수 없는 품목을 오류로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('usage_history'),
    mapping: usageMapping,
    rows: [{ rowNumber: 2, values: { 품목코드: 'UNKNOWN', 출고일: 'bad-date', 출고수량: '', 창고: 'A' } }],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(),
  });

  assert.deepEqual(
    result.issues.map((issue) => [issue.fieldName, issue.errorCode, issue.severity, issue.originalValue]),
    [
      ['item_id', 'UNKNOWN_ITEM', 'ERROR', 'UNKNOWN'],
      ['use_date', 'INVALID_DATE', 'ERROR', 'bad-date'],
      ['qty', 'REQUIRED_VALUE_MISSING', 'ERROR', ''],
    ],
  );
  assert.equal(result.errorRows, 1);
  assert.equal(result.canImport, false);
});

test('필수 표준 필드가 매핑되지 않으면 적재를 차단한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('usage_history'),
    mapping: { item_id: '품목코드', use_date: '출고일' },
    rows: [{ rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01' } }],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(),
  });

  assert.deepEqual(result.issues, [{
    rowNumber: 1,
    fieldName: 'qty',
    errorCode: 'REQUIRED_MAPPING_MISSING',
    errorMessage: '필수 표준 필드 qty의 원본 컬럼 매핑을 확인해야 합니다.',
    severity: 'ERROR',
    originalValue: null,
  }]);
});

test('동일 source header를 여러 표준 필드에 매핑하면 검증 오류로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('usage_history'),
    mapping: { item_id: '품목코드', use_date: '출고일', qty: '품목코드' },
    rows: [{ rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01' } }],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(),
  });

  assert.equal(result.issues[0]?.errorCode, 'DUPLICATE_SOURCE_HEADER_MAPPING');
  assert.equal(result.canImport, false);
});

test('자연키가 같은 파일 행을 duplicate 오류로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('usage_history'),
    mapping: usageMapping,
    rows: [
      { rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01', 출고수량: '2', 창고: 'A' } },
      { rowNumber: 3, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01', 출고수량: '3', 창고: 'A' } },
    ],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(),
  });

  assert.deepEqual(result.issues.map((issue) => [issue.rowNumber, issue.errorCode]), [
    [3, 'DUPLICATE_NATURAL_KEY'],
  ]);
});

test('수량을 숫자로 바꾸거나 0으로 보정하지 않고 음수 수량은 오류로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('usage_history'),
    mapping: usageMapping,
    rows: [{ rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01', 출고수량: '-2', 창고: 'A' } }],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(),
  });

  assert.deepEqual(result.issues.map((issue) => [issue.errorCode, issue.severity, issue.originalValue]), [
    ['FORBIDDEN_NEGATIVE_QUANTITY', 'ERROR', '-2'],
  ]);
});

test('반품 성격 business event의 음수 수량은 확인이 필요한 WARNING으로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('business_event'),
    mapping: { event_date: '행사일', event_type: '행사유형', qty: '수량' },
    rows: [{ rowNumber: 2, values: { 행사일: '2026-08-01', 행사유형: 'RETURN', 수량: '-2' } }],
    knownItemIds: new Set(),
    knownSupplierIds: new Set(),
  });

  assert.equal(result.issues[0]?.severity, 'WARNING');
  assert.equal(result.warningRows, 1);
  assert.equal(result.canImport, true);
});

test('발주일보다 이른 납기일과 알 수 없는 공급처를 오류로 기록한다', () => {
  const result = validateImportRows({
    schema: getImportSchema('purchase_order'),
    mapping: {
      po_no: '발주번호', order_date: '발주일', supplier_name: '공급업체', item_id: '품목코드', qty: '발주수량', due_date: '납기예정일',
    },
    rows: [{ rowNumber: 2, values: { 발주번호: 'PO1', 발주일: '2026-08-10', 공급업체: 'UNKNOWN', 품목코드: 'ITEM001', 발주수량: '2', 납기예정일: '2026-08-09' } }],
    knownItemIds: new Set(['ITEM001']),
    knownSupplierIds: new Set(['공급처 A']),
  });

  assert.deepEqual(result.issues.map((issue) => issue.errorCode), ['UNKNOWN_SUPPLIER', 'INVALID_DATE_RELATIONSHIP']);
});
