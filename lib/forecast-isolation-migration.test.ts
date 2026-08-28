import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20260828000300_create_forecast_data_isolation.sql', import.meta.url);
const rawBootstrapMigrationPath = new URL('../supabase/migrations/20260828000050_create_raw_usage_history_base.sql', import.meta.url);
const importPipelineMigrationPath = new URL('../supabase/migrations/20260828000400_create_import_pipeline.sql', import.meta.url);

test('raw 사용 이력 bootstrap은 기존 데이터를 삭제하지 않고 최소 입력 구조를 만든다', () => {
  const migration = readFileSync(rawBootstrapMigrationPath, 'utf8');
  assert.match(migration, /create schema if not exists raw/i);
  assert.match(migration, /create table if not exists raw\.usage_history/i);
  for (const column of ['usage_id', 'item_id', 'use_date', 'qty', 'warehouse', 'note']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.doesNotMatch(migration, /\bdrop\s+(table|schema)\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\s+raw\.usage_history\b/i);
});

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

test('STEP 4 migration은 batch, staging, mapping, 오류, rollback, forecast 변경 이력을 추가한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  for (const table of [
    'upload_batch',
    'import_staging',
    'column_mapping',
    'validation_error',
    'import_rollback_snapshot',
    'forecast_data_change',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists core\\.${table}`, 'i'));
  }

  assert.match(migration, /create or replace view core\.import_batch_summary/i);
  assert.match(migration, /'PARSED'.*'VALIDATED'.*'IMPORTED'.*'ROLLED_BACK'.*'FAILED'/is);
  assert.match(migration, /'SUCCESS'.*'WARNING'.*'ERROR'/is);
});

test('Import migration은 기존 RAW schema를 변경하지 않고 provenance 선행 조건을 검증한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  for (const table of [
    'usage_history',
    'inventory',
    'item_master',
    'supplier_master',
    'purchase_order',
    'goods_receipt',
    'sales_order',
    'business_event',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`, 'i'));
  }

  for (const column of ['batch_id', 'source_type', 'loaded_at', 'source_record_id']) {
    assert.match(migration, new RegExp(`'${column}'`, 'i'));
  }

  assert.doesNotMatch(migration, /\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?raw\./i);
});

test('Import 승인 RPC는 ADMIN과 검증 완료 batch만 허용하고 provenance를 채운다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.match(migration, /create or replace function core\.import_approved_batch\s*\(/i);
  assert.match(migration, /if not core\.is_admin\(\) then\s+raise exception 'ADMIN_REQUIRED'/i);
  assert.match(migration, /status\s*<>\s*'VALIDATED'/i);
  assert.match(migration, /error_rows\s*<>\s*0/i);
  assert.match(migration, /source_type[\s\S]*'FILE_UPLOAD'/i);
  assert.match(migration, /source_record_id/i);
  assert.match(migration, /batch_id/i);
  assert.match(migration, /loaded_at/i);
});

test('upsert는 기존 FILE_UPLOAD 행을 snapshot하고 append/upsert rollback은 batch 범위만 제거한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.match(migration, /import_mode\s*=\s*'upsert'/i);
  assert.match(migration, /insert into core\.import_rollback_snapshot/i);
  assert.match(migration, /'source_type',\s*'FILE_UPLOAD'/i);
  assert.match(migration, /create or replace function core\.rollback_import_batch\s*\(/i);
  assert.match(migration, /where batch_id\s*=\s*\$1/i);
  assert.match(migration, /unique\s*\(batch_id,\s*raw_table,\s*source_record_id\)/i);
  assert.match(migration, /SOURCE_RECORD_ID_REQUIRED/i);
  assert.doesNotMatch(migration, /coalesce\(staging\.source_record_id,\s*staging\.row_number::text\)/i);
});

test('Import migration은 누락 RAW table을 migration 시점에 실패시키지 않고 실행 시점에 명시적으로 거부한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.doesNotMatch(migration, /IMPORT_RAW_TABLE_REQUIRED/i);
  assert.match(migration, /IMPORT_TARGET_UNAVAILABLE/i);
  assert.match(migration, /to_regclass\(format\('raw\.%I', target_table\)\) is null/i);
});

test('Import RPC는 writable payload column만 명시 삽입하고 generated 또는 identity-always column을 거부한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.doesNotMatch(migration, /jsonb_populate_record\(null::raw\.%1\$I, \$1\)\)\.\*/i);
  assert.match(migration, /is_generated\s*=\s*'ALWAYS'/i);
  assert.match(migration, /identity_generation\s*=\s*'ALWAYS'/i);
  assert.match(migration, /IMPORT_RAW_PAYLOAD_COLUMN_UNSUPPORTED/i);
  assert.match(migration, /insert into raw\.%I \(%s\) select %s/i);
  assert.match(migration, /set search_path = pg_catalog, core, raw/i);
  assert.doesNotMatch(migration, /set search_path = core, raw, public/i);
});

test('Import core table re-run은 essential columns를 ALTER ADD COLUMN IF NOT EXISTS로 보완한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.match(migration, /alter table core\.upload_batch add column if not exists failure_code text/i);
  assert.match(migration, /alter table core\.import_staging add column if not exists source_record_id text/i);
  assert.match(migration, /create unique index if not exists import_staging_batch_source_record_id_unique/i);
});

test('replace는 명시 확인을 요구하고 rollback을 거부한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.match(migration, /replace_confirmation\s+is distinct from\s+'REPLACE'/i);
  assert.match(migration, /raise exception 'REPLACE_CONFIRMATION_REQUIRED'/i);
  assert.match(migration, /raise exception 'REPLACE_ROLLBACK_NOT_SUPPORTED'/i);
  assert.match(migration, /rollback_supported[\s\S]*import_mode\s*<>\s*'replace'/i);
});

test('Import 관리 객체는 RLS와 ADMIN mutation 정책 및 안전한 RPC 권한을 사용한다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  for (const table of [
    'upload_batch',
    'import_staging',
    'column_mapping',
    'validation_error',
    'import_rollback_snapshot',
    'forecast_data_change',
  ]) {
    assert.match(migration, new RegExp(`alter table core\\.${table} enable row level security`, 'i'));
  }

  assert.match(migration, /uploaded_by\s*=\s*auth\.uid\(\)\s+or\s+core\.is_admin\(\)/i);
  assert.match(migration, /using \(core\.is_admin\(\)\) with check \(core\.is_admin\(\)\)/i);
  assert.match(migration, /revoke all on function core\.import_approved_batch[^;]+from public, anon/i);
  assert.match(migration, /revoke all on function core\.rollback_import_batch[^;]+from public, anon/i);
  assert.match(migration, /grant execute on function core\.import_approved_batch[^;]+to authenticated/i);
  assert.match(migration, /grant execute on function core\.rollback_import_batch[^;]+to authenticated/i);
});

test('수요 영향 Import만 Forecast stale 변경 이력을 남긴다', () => {
  const migration = readFileSync(importPipelineMigrationPath, 'utf8');

  assert.match(migration, /import_type\s+in\s*\(\s*'usage_history',\s*'sales_order',\s*'business_event'\s*\)/i);
  assert.match(migration, /insert into core\.forecast_data_change/i);
  assert.match(migration, /rolled_back_at/i);
});
