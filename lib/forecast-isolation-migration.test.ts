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

test('train/test view와 coverage view가 DB 설정 경계를 사용한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  for (const view of ['core.v_train_demand', 'core.v_test_actual', 'analytics.v_data_coverage']) {
    assert.match(migration, new RegExp(`create or replace view ${view.replace('.', '\\.')}`, 'i'));
  }
  assert.match(migration, /from core\.forecast_setting/i);
  assert.match(migration, /train_end < test_start/i);
});

test('정책 테이블 mutation은 ADMIN RLS 정책을 사용한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /create policy policy_config_admin_mutation/i);
  assert.match(migration, /using \(core\.is_admin\(\)\)/i);
  assert.match(migration, /revoke all on schema core from anon/i);
});

test('사용 이력 선행 조건과 활성 사용자 접근 조건을 명시한다', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /STEP 3 requires raw\.usage_history/i);
  assert.match(migration, /create or replace function core\.is_active_user/i);
  assert.match(migration, /using \(core\.is_active_user\(\)\)/i);
  assert.match(migration, /where core\.is_active_user\(\)/i);
});
