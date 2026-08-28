import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPreviewSample,
  buildErrorCsv,
  buildSourceRecordId,
  canApproveImport,
  canRollbackImport,
} from './repository.ts';

test('미리보기는 원본 헤더와 첫 행만 안전한 개수로 반환한다', () => {
  const preview = buildPreviewSample([
    { rowNumber: 2, values: { 품목코드: 'A', 출고수량: '1' } },
    { rowNumber: 3, values: { 품목코드: 'B', 출고수량: '2', 비고: 'x' } },
    { rowNumber: 4, values: { 품목코드: 'C', 출고수량: '3' } },
  ], 2);

  assert.deepEqual(preview.headers, ['품목코드', '출고수량', '비고']);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0]?.rowNumber, 2);
});

test('검증 완료되고 오류가 없는 batch만 승인할 수 있다', () => {
  assert.equal(canApproveImport({ status: 'VALIDATED', errorRows: 0 }), true);
  assert.equal(canApproveImport({ status: 'PARSED', errorRows: 0 }), false);
  assert.equal(canApproveImport({ status: 'VALIDATED', errorRows: 1 }), false);
});

test('replace batch는 rollback 지원 여부가 false이면 rollback할 수 없다', () => {
  assert.equal(canRollbackImport({ mode: 'replace', status: 'IMPORTED', rollbackSupported: false }), false);
  assert.equal(canRollbackImport({ mode: 'append', status: 'IMPORTED', rollbackSupported: true }), true);
});

test('natural key로 안정적인 source record id를 만든다', () => {
  assert.equal(
    buildSourceRecordId('usage_history', ['ITEM-001', '2026-08-01', 'WH-A']),
    'usage_history:ITEM-001:2026-08-01:WH-A',
  );
  assert.equal(buildSourceRecordId('usage_history', ['ITEM-001', null, 'WH-A']), null);
});

test('오류 CSV에는 원본 데이터와 오류 메타데이터를 포함한다', () => {
  const csv = buildErrorCsv([
    {
      rowNumber: 2,
      originalData: { 품목코드: 'UNKNOWN', 출고수량: '' },
      errorCode: 'UNKNOWN_ITEM',
      errorMessage: '품목을 찾을 수 없습니다.',
      severity: 'ERROR',
    },
  ]);

  assert.match(csv, /품목코드/);
  assert.match(csv, /row_number/);
  assert.match(csv, /UNKNOWN_ITEM/);
  assert.match(csv, /UNKNOWN,,2/);
  assert.ok(csv.startsWith('\uFEFF'));
});

test('오류 CSV는 Excel 수식으로 해석될 수 있는 값을 텍스트로 만든다', () => {
  const csv = buildErrorCsv([{
    rowNumber: 2, originalData: { 품목코드: '=HYPERLINK("https://example.test")' },
    errorCode: '+FORMULA', errorMessage: '@수식 방지', severity: 'ERROR',
  }]);

  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+FORMULA/);
  assert.match(csv, /'@수식 방지/);
});
