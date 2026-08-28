# STEP 3 데이터 모델 확장 및 학습·검증 격리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 적재 추적용 raw 확장과 DB 기반 train/test 경계를 구현하여 STEP 5/6 Forecast 코드의 data leakage를 차단한다.

**Architecture:** 단일 idempotent Supabase migration이 raw 확장, core 정책·forecast 설정, 학습/검증 view, analytics 검증 view와 RLS를 생성한다. `core.forecast_setting`은 실제 사용 이력의 최소/최대일에서 시간순 80/20 경계를 한 번 저장하고, 이후 Forecast 진입점은 `lib/forecast-data.ts`의 core view 계약을 사용한다.

**Tech Stack:** Next.js 15, TypeScript, Node.js built-in test runner, PostgreSQL/Supabase, `@supabase/ssr`.

**Spec:** `docs/superpowers/specs/2026-08-28-step3-data-isolation-design.md`

## Global Constraints

- 기존 raw 데이터와 analytics view를 drop/recreate하지 않고 `ALTER TABLE`과 새 객체 생성만 사용한다.
- raw.usage_history의 날짜 또는 수량 null을 0으로 변환하지 않는다.
- train/test 날짜를 TypeScript 또는 SQL의 날짜 리터럴로 고정하지 않는다.
- Forecast/Demand Profile은 `core.v_train_demand`, Backtest scoring은 `core.v_test_actual`만 사용한다.
- anon은 업무 데이터 접근 불가, 정책 테이블 mutation은 ADMIN만 가능해야 한다.
- 이번 단계에서는 화면을 만들지 않으며 `/admin/forecast-settings`가 읽을 analytics view만 준비한다.

---

## File structure

- Create: `supabase/migrations/20260828000300_create_forecast_data_isolation.sql` — STEP 3 DB 객체, RLS, grants
- Create: `lib/forecast-data.ts` — train/test view 계약
- Create: `lib/forecast-data.test.ts` — Forecast source 계약과 raw 직접 참조 금지 회귀 테스트
- Create: `lib/forecast-isolation-migration.test.ts` — migration 객체·경계·권한 선언 정적 테스트
- Modify: `error.md` — migration 수동 적용과 coverage 검증 기록

## Task 1: Forecast source 계약

**Files:**

- Create: `lib/forecast-data.ts`
- Create: `lib/forecast-data.test.ts`

**Interfaces:**

- Produces: `ForecastDatasetKind = 'train' | 'test'`
- Produces: `getForecastDataset(kind): { schema: 'core'; relation: 'v_train_demand' | 'v_test_actual' }`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getForecastDataset } from './forecast-data.ts';

test('Forecast 학습 데이터는 train 전용 view를 사용한다', () => {
  assert.deepEqual(getForecastDataset('train'), { schema: 'core', relation: 'v_train_demand' });
});

test('Backtest actual은 test 전용 view를 사용한다', () => {
  assert.deepEqual(getForecastDataset('test'), { schema: 'core', relation: 'v_test_actual' });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- lib/forecast-data.test.ts`

Expected: fail because `lib/forecast-data.ts` does not exist.

- [ ] **Step 3: Implement the minimal source contract**

```ts
export type ForecastDatasetKind = 'train' | 'test';

export function getForecastDataset(kind: ForecastDatasetKind) {
  return kind === 'train'
    ? { schema: 'core' as const, relation: 'v_train_demand' as const }
    : { schema: 'core' as const, relation: 'v_test_actual' as const };
}
```

Do not add dates, raw queries, or fallback calculations.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `npm test -- lib/forecast-data.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/forecast-data.ts lib/forecast-data.test.ts
git commit -m "Forecast 데이터 소스 계약 추가"
```

## Task 2: Raw, policy, and setting migration

**Files:**

- Create: `supabase/migrations/20260828000300_create_forecast_data_isolation.sql`
- Create: `lib/forecast-isolation-migration.test.ts`

**Interfaces:**

- Consumes: `core.is_admin()` from `supabase/migrations/20260828000100_create_auth_rbac.sql`
- Produces: tracking columns, three raw tables, `core.policy_config`, `core.outlier_rule`, `core.item_policy`, `core.forecast_setting`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260828000300_create_forecast_data_isolation.sql', import.meta.url), 'utf8');

test('STEP 3 migration은 새 raw 테이블과 적재 추적 컬럼을 선언한다', () => {
  for (const table of ['business_event', 'sales_order', 'item_substitute']) {
    assert.match(migration, new RegExp(`create table if not exists raw\\.${table}`, 'i'));
  }
  for (const column of ['batch_id', 'source_type', 'loaded_at', 'source_record_id']) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'));
  }
});

test('기간 설정은 사용 이력 실제 범위로 초기화한다', () => {
  assert.match(migration, /min\(use_date\)/i);
  assert.match(migration, /max\(use_date\)/i);
  assert.doesNotMatch(migration, /'20\d\d-\d\d-\d\d'/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- lib/forecast-isolation-migration.test.ts`

Expected: fail because the STEP 3 migration does not exist.

- [ ] **Step 3: Implement table creation and automatic 80/20 setting**

In a `DO $$` loop, add nullable `batch_id uuid`, `source_type text`, `loaded_at timestamptz`, and `source_record_id text` to `shipment_log`, `supplier_master`, `item_master`, `inventory`, `usage_history`, `purchase_order`, `goods_receipt`, and `forecast`.

Create `raw.business_event`, `raw.sales_order`, and `raw.item_substitute` with UUID PKs (`gen_random_uuid()`), the four tracking columns, date/quantity/priority checks, and indexes. Do not create an FK into existing raw masters. Create singleton `core.policy_config` and `core.forecast_setting`, plus `core.outlier_rule` and `core.item_policy`. Seed only an empty policy row.

```sql
with bounds as (
  select min(use_date) as first_date, max(use_date) as last_date
  from raw.usage_history where use_date is not null
), split as (
  select first_date, last_date,
    first_date + floor(((last_date - first_date + 1) * 0.8))::integer as test_start
  from bounds where last_date > first_date
)
insert into core.forecast_setting (setting_key, train_start, train_end, test_start, test_end, granularity)
select true, first_date, test_start - 1, test_start, last_date, 'DAILY'
from split on conflict (setting_key) do nothing;
```

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `npm test -- lib/forecast-isolation-migration.test.ts`

Expected: object, tracking-column, and dynamic-date assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260828000300_create_forecast_data_isolation.sql lib/forecast-isolation-migration.test.ts
git commit -m "Forecast 데이터 모델과 기간 설정 추가"
```

## Task 3: Data isolation views and RLS

**Files:**

- Modify: `supabase/migrations/20260828000300_create_forecast_data_isolation.sql`
- Modify: `lib/forecast-isolation-migration.test.ts`

**Interfaces:**

- Consumes: `raw.usage_history`, `core.forecast_setting`, `core.policy_config`, `core.is_admin()`
- Produces: `core.v_train_demand`, `core.v_test_actual`, `analytics.v_data_coverage`, `analytics.v_forecast_settings`

- [ ] **Step 1: Extend the failing test**

```ts
test('train/test view와 coverage view가 DB 설정 경계를 사용한다', () => {
  for (const view of ['core.v_train_demand', 'core.v_test_actual', 'analytics.v_data_coverage']) {
    assert.match(migration, new RegExp(`create or replace view ${view.replace('.', '\\.')}`, 'i'));
  }
  assert.match(migration, /from core\.forecast_setting/i);
  assert.match(migration, /train_end < test_start/i);
});

test('정책 테이블 mutation은 ADMIN RLS 정책을 사용한다', () => {
  assert.match(migration, /create policy policy_config_admin_mutation/i);
  assert.match(migration, /using \(core\.is_admin\(\)\)/i);
  assert.match(migration, /revoke all on schema core from anon/i);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- lib/forecast-isolation-migration.test.ts`

Expected: fail because views and RLS policies have not been declared.

- [ ] **Step 3: Implement the views**

```sql
create or replace view core.v_train_demand as
select u.usage_id, u.item_id, u.use_date, u.qty, u.warehouse, u.note,
  u.batch_id, u.source_type, u.loaded_at, u.source_record_id
from raw.usage_history u join core.forecast_setting s on s.setting_key
where u.use_date between s.train_start and s.train_end;

create or replace view core.v_test_actual as
select u.usage_id, u.item_id, u.use_date, u.qty, u.warehouse, u.note,
  u.batch_id, u.source_type, u.loaded_at, u.source_record_id
from raw.usage_history u join core.forecast_setting s on s.setting_key
where u.use_date between s.test_start and s.test_end;
```

Create `analytics.v_data_coverage` with raw bounds, setting, train/test counts, `train_window_ok`, `test_window_ok`, and `data_isolation_ok`. Each window flag requires populated settings, correct ordering, containment in raw bounds, and a positive row count. `data_isolation_ok` also requires `train_end < test_start`. Create `analytics.v_forecast_settings` by joining coverage with `policy_config`.

- [ ] **Step 4: Implement explicit grants and RLS**

Enable RLS on all new raw/core tables. Revoke anon schema/table rights. Grant authenticated SELECT on policy/config tables and analytics views. Grant authenticated DML only on core policy/config tables, then add `FOR ALL TO authenticated USING (core.is_admin()) WITH CHECK (core.is_admin())` mutation policies. Do not grant direct raw DML to authenticated.

- [ ] **Step 5: Run the test and confirm GREEN**

Run: `npm test -- lib/forecast-isolation-migration.test.ts`

Expected: view-boundary and ADMIN-RLS assertions pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260828000300_create_forecast_data_isolation.sql lib/forecast-isolation-migration.test.ts
git commit -m "Forecast 학습 검증 격리와 권한 추가"
```

## Task 4: Leakage guard, documentation, and verification

**Files:**

- Modify: `lib/forecast-data.test.ts`
- Modify: `error.md`

- [ ] **Step 1: Add the failing raw-reference guard**

```ts
import { readFileSync } from 'node:fs';

test('Forecast source 계약은 raw usage history를 직접 참조하지 않는다', () => {
  const source = readFileSync(new URL('./forecast-data.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /raw\.usage_history/);
  assert.match(source, /v_train_demand/);
  assert.match(source, /v_test_actual/);
});
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- lib/forecast-data.test.ts lib/forecast-isolation-migration.test.ts`

Expected: source contract, raw-reference guard, migration object, dynamic boundary, and RLS tests pass.

- [ ] **Step 3: Record remote verification SQL in error.md**

```sql
select * from analytics.v_data_coverage;
select * from analytics.v_forecast_settings;
select count(*) as overlap_count
from core.v_train_demand train
join core.v_test_actual test on train.usage_id = test.usage_id;
```

Document that both window flags must be true, `overlap_count` must be 0, and `public`, `core`, `analytics` must be exposed in Supabase Data API.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: all existing and STEP 3 tests pass.

Run: `npm run build`

Expected: exit code 0 with Next.js compilation and type validation completed.

- [ ] **Step 5: Commit**

```bash
git add lib/forecast-data.test.ts error.md
git commit -m "Forecast 데이터 격리 검증 추가"
```

## Required remote SQL verification

After commits, execute `supabase/migrations/20260828000300_create_forecast_data_isolation.sql` in the target Supabase SQL Editor, then run the Task 4 SQL. Git push never applies this migration automatically.

