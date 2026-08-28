import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { ImportParseError, parseImportFile } from './parse.ts';

test('CSV를 서버에서 파싱하고 원본 문자열과 실제 행 번호를 보존한다', async () => {
  const file = new File([
    '품목코드,출고일,출고수량\nITEM001,2026-08-01,12\nITEM002,2026-08-02, 7 ',
  ], 'usage.csv', { type: 'text/csv' });

  const rows = await parseImportFile(file, 'usage_history');

  assert.deepEqual(rows, [
    { rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01', 출고수량: '12' } },
    { rowNumber: 3, values: { 품목코드: 'ITEM002', 출고일: '2026-08-02', 출고수량: ' 7 ' } },
  ]);
});

test('XLSX를 서버에서 파싱하고 원본 셀 문자열과 행 번호를 보존한다', async () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['품목코드', '출고일', '출고수량'],
    ['ITEM001', '2026-08-01', 12],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, '사용이력');
  const file = new File([
    XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
  ], 'usage.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const rows = await parseImportFile(file, 'usage_history');

  assert.deepEqual(rows, [
    { rowNumber: 2, values: { 품목코드: 'ITEM001', 출고일: '2026-08-01', 출고수량: '12' } },
  ]);
});

test('CSV와 XLSX 이외 파일은 명시적인 오류 코드로 거부한다', async () => {
  const file = new File(['not an import'], 'usage.txt', { type: 'text/plain' });

  await assert.rejects(
    () => parseImportFile(file, 'usage_history'),
    (error: unknown) => error instanceof ImportParseError && error.code === 'UNSUPPORTED_FILE_TYPE',
  );
});

test('헤더가 비어 있으면 명시적인 오류 코드로 거부한다', async () => {
  const file = new File([',출고일,출고수량\nITEM001,2026-08-01,12'], 'usage.csv', { type: 'text/csv' });

  await assert.rejects(
    () => parseImportFile(file, 'usage_history'),
    (error: unknown) => error instanceof ImportParseError && error.code === 'EMPTY_HEADER',
  );
});
