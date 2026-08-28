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
