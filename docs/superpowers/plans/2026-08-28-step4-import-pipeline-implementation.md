# STEP 4 Import Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CSV/XLSX를 staging·검증·승인·batch 적재·history·rollback까지 안전하게 처리하는 ADMIN 전용 Import Pipeline을 만든다.

**Architecture:** 브라우저는 파일 선택과 매핑 확인만 담당한다. 서버 Route Handler가 parsing과 staging을 처리하고 순수 validation 모듈이 오류를 만든다. DB RPC가 정상 행만 RAW에 적재하고 provenance·rollback snapshot·Forecast stale 신호를 기록한다.

**Tech Stack:** Next.js 15, TypeScript, Supabase SSR/PostgREST RPC, PostgreSQL RLS, papaparse, xlsx, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-step4-import-pipeline-design.md`

## Global Constraints

- 지원 타입은 `usage_history`, `inventory`, `item_master`, `supplier_master`, `purchase_order`, `goods_receipt`, `sales_order`, `business_event`만이다.
- parsing/validation/RAW insert는 서버와 DB에서 수행하며 오류 값을 추정·수정·0 치환하지 않는다.
- RAW insert는 validation 완료 및 ADMIN 승인 후 DB RPC에서만 수행한다.
- 모든 파일 적재 행은 `batch_id`, `FILE_UPLOAD`, `loaded_at`, `source_record_id`를 가진다.
- anon과 USER는 upload/import/rollback을 수행할 수 없다. service role key를 사용하지 않는다.
- replace는 `REPLACE` 확인을 요구하고 rollback 불가를 표시한다.
- CSS framework를 추가하지 않고 기존 공통 UI 컴포넌트와 CSS token을 사용한다.

---

### Task 1: Import 타입·매핑 계약과 의존성

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/import/types.ts`, `lib/import/schema.ts`, `lib/import/schema.test.ts`

**Interfaces:** Produces `ImportType`, `ImportMode`, `ValidationSeverity`, `ColumnMapping`, `ImportSchema`, `getImportSchema(type)`, `suggestColumnMapping(type, headers)`.

- [ ] **Step 1: Write the failing test**

```ts
assert.deepEqual(getImportSchema('usage_history').requiredFields, ['usage_id', 'item_id', 'use_date', 'qty']);
assert.equal(suggestColumnMapping('usage_history', ['품목코드', '출고일', '출고수량']).item_id, '품목코드');
assert.throws(() => getImportSchema('forecast' as ImportType));
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --runInBand`

Expected: missing schema module failure.

- [ ] **Step 3: Implement the minimal contract**

Add `papaparse` and `xlsx`. Define actual RAW column names, Korean/English aliases, natural keys, master references, date/quantity fields and `demandAffecting` per eight types.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test -- --runInBand`

Expected: mapping tests pass.

Commit: `git commit -m "Import 타입과 매핑 계약 추가"`

### Task 2: 서버 parser와 단일 validation 모듈

**Files:**
- Create: `lib/import/parse.ts`, `lib/import/validate.ts`
- Create: `lib/import/parse.test.ts`, `lib/import/validate.test.ts`

**Interfaces:** Consumes Task 1 schema. Produces `parseImportFile(file, type)` and `validateImportRows({ schema, mapping, rows, knownItemIds, knownSupplierIds })`.

- [ ] **Step 1: Write failing tests**

```ts
const rows = await parseImportFile(csvFile, 'usage_history');
assert.equal(rows[0].original['품목코드'], 'ITEM001');
const result = validateImportRows({ schema: getImportSchema('usage_history'), mapping, rows: [{ rowNumber: 2, original: { 품목코드: 'UNKNOWN', 출고일: 'bad-date', 출고수량: '' } }], knownItemIds: new Set(['ITEM001']), knownSupplierIds: new Set() });
assert.deepEqual(result.issues.map(({ code }) => code), ['REQUIRED_VALUE_MISSING', 'INVALID_DATE', 'UNKNOWN_ITEM']);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --runInBand`

Expected: missing parser/validator exports.

- [ ] **Step 3: Implement minimal server-only parsing and validation**

Use Papa for CSV and XLSX for ArrayBuffer. Preserve source strings and row number. Validate required mapping/value, numeric/date parse, natural-key duplicate, item/supplier master existence, negative quantity rule and defined date relationships. Return reason codes without mutation.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test -- --runInBand`

Expected: CSV/XLSX, invalid date, missing value, duplicate, unknown master and warning tests pass.

Commit: `git commit -m "서버 Import parsing과 검증 추가"`

### Task 3: staging·validation error·batch rollback migration

**Files:**
- Create: `supabase/migrations/20260828000400_create_import_pipeline.sql`
- Modify: `lib/forecast-isolation-migration.test.ts`

**Interfaces:** Produces `core.upload_batch`, `core.import_staging`, `core.column_mapping`, `core.validation_error`, `core.import_rollback_snapshot`, `core.forecast_data_change`, `core.import_batch_summary`, `core.import_approved_batch(batch_id, replace_confirmation)`, `core.rollback_import_batch(batch_id)`.

- [ ] **Step 1: Write the failing migration assertions**

```ts
assert.match(migration, /create table if not exists core\.upload_batch/i);
assert.match(migration, /create table if not exists core\.import_staging/i);
assert.match(migration, /create table if not exists core\.validation_error/i);
assert.match(migration, /if not core\.is_admin\(\) then raise exception 'ADMIN_REQUIRED'/i);
assert.match(migration, /source_type.*FILE_UPLOAD/i);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --runInBand`

Expected: STEP 4 migration file missing.

- [ ] **Step 3: Implement additive DB objects**

Use JSONB staging/original values and checked statuses `PARSED`, `VALIDATED`, `IMPORTED`, `ROLLED_BACK`, `FAILED`. Enable RLS; active users read own batches, ADMIN controls all. RPC rejects unvalidated/error batches, needs `REPLACE` for replace, inserts only non-error rows and fills provenance. Upsert snapshots prior FILE_UPLOAD records. append/upsert rollback is batch scoped; replace has `rollback_supported = false`. Demand types upsert `forecast_data_change` only.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test -- --runInBand`

Expected: DB/RLS/provenance contract tests pass.

Commit: `git commit -m "Import staging과 batch rollback DB 객체 추가"`

### Task 4: Server repository and mutation handlers

**Files:**
- Create: `lib/import/repository.ts`, `lib/import/history.ts`, `lib/import/repository.test.ts`
- Create: `app/(admin)/admin/data-management/actions.ts`
- Create: `app/api/admin/import/error-csv/route.ts`

**Interfaces:** Produces `stageImport`, `validateBatch`, `getImportHistory`, `getValidationErrors`, `getErrorCsv`, `approveImport`, `rollbackBatch`.

- [ ] **Step 1: Write failing authorization and gate tests**

```ts
assert.equal(canApproveImport({ status: 'VALIDATED', errorRows: 0 }), true);
assert.equal(canApproveImport({ status: 'PARSED', errorRows: 0 }), false);
assert.equal(canRollbackImport({ mode: 'replace', status: 'IMPORTED', rollbackSupported: false }), false);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --runInBand`

Expected: missing repository helpers.

- [ ] **Step 3: Implement server-only repository**

Every mutation calls `requireAdmin()`. Parse FormData server-side, stage rows, query master ids once, save validation errors/counts, call DB RPC only after server-side approval check, and emit error CSV with original fields plus row/error/severity. Do not introduce service-role code.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test -- --runInBand`

Expected: approval, rollback gate and error CSV tests pass.

Commit: `git commit -m "Import 서버 처리와 오류 CSV 추가"`

### Task 5: Admin Data Management UI

**Files:**
- Modify: `lib/menu.ts`, `components/shell/sidebar.tsx`, `styles/components.css`
- Create: `app/(admin)/admin/data-management/page.tsx`
- Create: `components/import/import-wizard.tsx`, `components/import/import-history.tsx`, `components/import/validation-errors.tsx`
- Test: `lib/import/ui-route.test.ts`

**Interfaces:** Consumes Task 4 actions/models. Produces `/admin/data-management` File Upload, History, Validation Errors areas.

- [ ] **Step 1: Write failing route/menu tests**

```ts
assert.match(pageSource, /requireAdmin\(\)/);
assert.match(menuSource, /\/admin\/data-management/);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- --runInBand`

Expected: page/menu missing.

- [ ] **Step 3: Implement UI**

Use PageHeader, Panel, Badge, Button and DataTable. The client wizard handles file/type/mode/mapping only; it disables Validate until mapping confirmation and Import until `VALIDATED` with zero errors. Require explicit `REPLACE` text. Display non-reversible replace and supported rollback state. No direct hex colors or client validation loops.

- [ ] **Step 4: Run tests, build and commit**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: tests pass and build exits 0.

Commit: `git commit -m "관리자 데이터 적재 화면 추가"`

### Task 6: 운영 안내와 final verification

**Files:**
- Modify: `error.md`

- [ ] **Step 1: Document manual migration and verification**

```sql
select batch_id, import_type, import_mode, total_rows, success_rows, warning_rows, error_rows, status
from core.import_batch_summary
order by uploaded_at desc;
```

Document raw bootstrap dependency, Exposed schemas, real-data requirement and replace rollback limitation.

- [ ] **Step 2: Run final verification and commit**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: all tests pass and build exits 0.

Commit: `git commit -m "Import Pipeline 운영 검증 문서 추가"`
