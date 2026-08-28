import test from 'node:test';
import assert from 'node:assert/strict';
import { getImportSchema, suggestColumnMapping } from './schema.ts';

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
