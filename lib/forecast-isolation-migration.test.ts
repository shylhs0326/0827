import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20260828000300_create_forecast_data_isolation.sql', import.meta.url);

test('STEP 3 migration은 새 raw 테이블과 적재 추적 컬럼을 선언한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  for (const table of ['business_event', 'sales_order', 'item_substitute']) {
    assert.match(migration, new RegExp(`create table if not exists raw\\.${table}`, 'i'));
  }
  for (const column of ['batch_id', 'source_type', 'loaded_at', 'source_record_id']) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'));
  }
});

test('기간 설정은 사용 이력 실제 범위로 초기화한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /to_regclass\('raw\.usage_history'\)/i);
  assert.match(migration, /min\(use_date\)/i);
  assert.match(migration, /max\(use_date\)/i);
  assert.doesNotMatch(migration, /'20\d\d-\d\d-\d\d'/);
});

test('raw 테이블이 부분적으로 존재해도 적재 추적 컬럼을 안전하게 보완한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /to_regclass\(format\('raw\.%I', target_table\)\)/i);
  for (const table of ['business_event', 'sales_order', 'item_substitute']) {
    assert.match(migration, new RegExp(`alter table if exists raw\\.${table} add column if not exists batch_id`, 'i'));
  }
});
