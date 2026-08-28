import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateSourceHeaders, getImportSchema, suggestColumnMapping } from './schema.ts';
import { isImportType } from './types.ts';

test('사용 이력 스키마는 품목, 사용일, 수량을 필수 필드로 요구한다', () => {
  const schema = getImportSchema('usage_history');

  assert.equal(schema.rawTable, 'usage_history');
  assert.deepEqual(schema.requiredFields, ['item_id', 'use_date', 'qty']);
  assert.deepEqual(schema.naturalKey, ['item_id', 'use_date', 'warehouse']);
  assert.equal(schema.affectsDemand, true);
});

test('한국어 사용 이력 헤더를 표준 필드로 제안한다', () => {
  const mapping = suggestColumnMapping('usage_history', ['품목코드', '출고일', '출고수량', '창고']);

  assert.deepEqual(mapping, {
    item_id: '품목코드',
    use_date: '출고일',
    qty: '출고수량',
    warehouse: '창고',
  });
});

test('지원하지 않는 forecast 타입은 명확히 거부한다', () => {
  assert.throws(
    () => getImportSchema('forecast' as never),
    /지원하지 않는 Import 타입: forecast/,
  );
});

test('지원하는 여덟 Import 타입은 실제 raw 테이블과 검증 계약을 유지한다', () => {
  const expected = {
    usage_history: { rawTable: 'usage_history', requiredFields: ['item_id', 'use_date', 'qty'], naturalKey: ['item_id', 'use_date', 'warehouse'], itemReferenceFields: ['item_id'], supplierReferenceFields: [], affectsDemand: true },
    inventory: { rawTable: 'inventory', requiredFields: ['item_id', 'warehouse', 'current_stock', 'as_of_date'], naturalKey: ['item_id', 'warehouse', 'as_of_date'], itemReferenceFields: ['item_id'], supplierReferenceFields: [], affectsDemand: false },
    item_master: { rawTable: 'item_master', requiredFields: ['item_id', 'item_name'], naturalKey: ['item_id'], itemReferenceFields: [], supplierReferenceFields: ['supplier_id'], affectsDemand: false },
    supplier_master: { rawTable: 'supplier_master', requiredFields: ['supplier_id', 'supplier_name'], naturalKey: ['supplier_id'], itemReferenceFields: [], supplierReferenceFields: [], affectsDemand: false },
    purchase_order: { rawTable: 'purchase_order', requiredFields: ['po_no', 'order_date', 'supplier_name', 'item_id', 'qty'], naturalKey: ['po_no', 'item_id'], itemReferenceFields: ['item_id'], supplierReferenceFields: ['supplier_name'], affectsDemand: false },
    goods_receipt: { rawTable: 'goods_receipt', requiredFields: ['receipt_no', 'po_no', 'item_id', 'qty', 'receipt_date'], naturalKey: ['receipt_no', 'item_id'], itemReferenceFields: ['item_id'], supplierReferenceFields: [], affectsDemand: false },
    sales_order: { rawTable: 'sales_order', requiredFields: ['order_no', 'line_no', 'order_date', 'item_id', 'qty'], naturalKey: ['order_no', 'line_no'], itemReferenceFields: ['item_id'], supplierReferenceFields: [], affectsDemand: true },
    business_event: { rawTable: 'business_event', requiredFields: ['event_date', 'event_type'], naturalKey: ['event_date', 'event_type', 'item_id'], itemReferenceFields: ['item_id'], supplierReferenceFields: [], affectsDemand: true },
  } as const;

  for (const [type, contract] of Object.entries(expected)) {
    const schema = getImportSchema(type as keyof typeof expected);
    assert.deepEqual({
      rawTable: schema.rawTable,
      requiredFields: schema.requiredFields,
      naturalKey: schema.naturalKey,
      itemReferenceFields: schema.itemReferenceFields,
      supplierReferenceFields: schema.supplierReferenceFields,
      affectsDemand: schema.affectsDemand,
    }, contract);
  }
});

test('기존 raw 테이블은 한글 실제 컬럼으로 적재한다', () => {
  const legacyColumns = {
    inventory: ['품목코드', '창고', '현재고', '기준일자', '안전재고'],
    item_master: ['품목코드', '품목명', '품목구분', '단위', '표준단가', '사용여부', 'supplier_id'],
    supplier_master: ['공급업체코드', '공급업체명', '국가', '표준리드타임(일)', '담당자', '사용여부'],
    purchase_order: ['발주번호', '발주일', '공급업체', '품목코드', '발주수량', '단가', '납기예정일', '발주담당'],
    goods_receipt: ['입고번호', '발주번호', '품목코드', '입고수량', '입고일', '입고창고'],
  } as const;

  for (const [type, columns] of Object.entries(legacyColumns)) {
    assert.deepEqual(
      getImportSchema(type as keyof typeof legacyColumns).fields.map((field) => field.rawColumn),
      columns,
    );
  }
});

test('Route Handler 입력값은 지원 Import 타입만 통과시킨다', () => {
  assert.equal(isImportType('sales_order'), true);
  assert.equal(isImportType('forecast'), false);
  assert.equal(isImportType(''), false);
});

test('하나의 source header를 여러 표준 필드에 연결한 mapping을 감지한다', () => {
  assert.deepEqual(
    findDuplicateSourceHeaders({ item_id: '품목코드', qty: '품목코드', warehouse: '창고' }),
    ['품목코드'],
  );
});
