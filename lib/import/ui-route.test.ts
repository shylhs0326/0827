import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../..', import.meta.url);

test('관리자 데이터 적재 화면은 서버에서 ADMIN 권한을 확인한다', async () => {
  const pageSource = await readFile(new URL('app/(admin)/admin/data-management/page.tsx', root), 'utf8');

  assert.match(pageSource, /requireAdmin\(\)/);
});

test('관리자 메뉴는 데이터 관리를 중앙 메뉴 정의에서 제공한다', async () => {
  const menuSource = await readFile(new URL('lib/menu.ts', root), 'utf8');

  assert.match(menuSource, /\/admin\/data-management/);
});

test('데이터 관리 화면은 URL의 batchId로 선택한 validation error를 조회한다', async () => {
  const pageSource = await readFile(new URL('app/(admin)/admin/data-management/page.tsx', root), 'utf8');

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /selectedBatchId/);
  assert.match(pageSource, /IMPORT_HISTORY_UNAVAILABLE/);
});

test('업로드 wizard는 서버 preview를 표로 표시하고 새 업로드를 초기화한다', async () => {
  const wizardSource = await readFile(new URL('components/import/import-wizard.tsx', root), 'utf8');

  assert.match(wizardSource, /preview/);
  assert.match(wizardSource, /미리보기/);
  assert.match(wizardSource, /새 업로드/);
  assert.match(wizardSource, /aria-live="assertive"/);
});

test('Import History는 업로드 사용자와 validation batch 선택 링크를 표시한다', async () => {
  const historySource = await readFile(new URL('components/import/import-history.tsx', root), 'utf8');

  assert.match(historySource, /uploaded_by_email/);
  assert.match(historySource, /uploaded_by_name/);
  assert.match(historySource, /batchId=/);
});
