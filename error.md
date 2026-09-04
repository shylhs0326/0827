# 오류 기록

## 2026-08-28 로그인 불가

### 증상

로그인 화면에서 로그인이 완료되지 않거나 로그인 후 다시 로그인 화면으로 돌아감. 정확한 브라우저 오류 메시지는 아직 제공되지 않음.

### 조사 결과

- `.env.local`의 Supabase URL과 publishable 키는 설정되어 있음.
- 로그인 성공 후 앱은 `core.app_user` 조회와 `core.record_login()` RPC를 호출함.
- `core.app_user`와 RBAC migration은 저장소에만 추가되어 있으며, 원격 Supabase 프로젝트에 실제 적용됐는지는 로컬에서 확인할 수 없음.
- migration이 적용되지 않았거나 기존 auth 사용자에 `core.app_user` 행이 없으면 로그인 직후 `/login?error=inactive`로 돌아갈 수 있음.

### 해결 방법

1. Supabase Dashboard → SQL Editor에서 `supabase/migrations/20260828000100_create_auth_rbac.sql` 전체를 실행한다.
2. 기존 사용자의 profile 행을 확인한다.

```sql
select user_id, email, role, active
from core.app_user;
```

3. 최초 관리자 계정은 해당 사용자의 이메일로 role을 지정한다.

```sql
update core.app_user
set role = 'ADMIN', active = true
where email = '관리자이메일@example.com';
```

4. 개발 서버를 재시작하고 다시 로그인한다.

### 추가 확인

계속 실패하면 브라우저 Network에서 `auth/v1/token` 응답과 `/login?error=...`의 query string, Supabase Auth 설정의 Email provider 활성화 여부를 확인한다.

## 2026-08-28 `42P01 relation core.app_user does not exist`

### 원인

`core.app_user`를 조회·수정하는 SQL을 실행했지만, 해당 테이블을 생성하는 RBAC migration이 Supabase 프로젝트에서 아직 실행되지 않았다.

### 해결 방법

`supabase/migrations/20260828000100_create_auth_rbac.sql` 전체를 먼저 실행한 뒤 아래 순서로 확인한다.

```sql
select to_regclass('core.app_user');
select user_id, email, role, active from core.app_user;
```

결과가 `core.app_user`로 나오면 기존 auth 사용자에게 ADMIN role을 지정할 수 있다.

## 2026-08-28 `3F000 schema analytics does not exist`

### 원인

RBAC migration이 존재하지 않는 `analytics` 스키마에 revoke를 실행하면서 전체 SQL이 중단되었다. Supabase SQL Editor의 트랜잭션 rollback으로 `core.app_user` 생성도 함께 취소되었다.

### 해결 방법

최신 migration에는 `create schema if not exists analytics`가 포함되어 있다. 수정된 `supabase/migrations/20260828000100_create_auth_rbac.sql` 전체를 다시 실행한다. 실행 후 `core.app_user` 조회와 관리자 role 지정을 진행한다.

## 2026-08-28 `to_regclass(...)` 결과가 NULL

### 원인

`core.app_user`와 `analytics` 모두 NULL이면 수정된 migration이 원격 데이터베이스에 적용되지 않은 상태다. migration을 실행하지 않았거나 실행 중 오류로 rollback된 것이다.

### 해결 방법

Supabase SQL Editor에서 migration 파일 내용을 모두 선택한 뒤 한 번에 실행한다. 실행 중 오류가 나면 그 오류를 먼저 해결해야 하며, 성공 후 다음 결과를 확인한다.

```sql
select to_regclass('core.app_user'), to_regclass('analytics');
```

## 2026-08-28 `이메일 또는 비밀번호를 확인하세요`

### 조사 결과

현재 로그인 폼은 Supabase의 모든 `signInWithPassword` 오류를 같은 문구로 표시한다. 따라서 이 문구만으로는 잘못된 비밀번호, Auth 사용자 미생성, 이메일 미확인, Email provider 설정 오류를 구분할 수 없다.

### 확인 순서

1. `.env.local`이 연결하는 Supabase 프로젝트와 현재 Dashboard 프로젝트가 같은지 확인한다.
2. Authentication → Providers → Email이 활성화되어 있는지 확인한다.
3. Authentication → Users에서 해당 이메일 사용자가 존재하고 Confirmed 상태인지 확인한다.
4. Dashboard에서 비밀번호를 재설정하거나 사용자를 새로 생성해 재시도한다.
5. 로그인 성공 후에도 `core.app_user` 행과 `active = true`가 필요하다.

## 2026-08-28 `invalid_credentials`

### 원인

Supabase Auth의 `signInWithPassword` 단계에서 이메일 또는 비밀번호 조합이 거부되었다. 이 단계에서는 `core.app_user`, RLS, middleware가 아직 실행되지 않는다.

### 해결 방법

Authentication → Users에서 같은 Supabase 프로젝트의 사용자가 존재하는지 확인하고, 존재하면 Dashboard에서 비밀번호를 재설정한다. 사용자가 없으면 Dashboard에서 Email 사용자로 새로 생성한다. Auth 로그인 성공 후에만 `core.app_user` backfill과 role 지정으로 진행한다.

## 2026-08-28 `No apikey request header or url param was found`

### 원인

Supabase 요청에 `apikey`가 전달되지 않은 환경 설정 또는 배포 bundle을 사용하고 있다. 비밀번호 오류가 아니며, `.env.local`은 Git push에 포함되지 않기 때문에 Vercel/다른 실행 환경에는 자동 전달되지 않는다.

### 해결 방법

`NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 실행 환경에 설정하고 개발 서버를 재시작하거나 배포를 다시 생성한다. 브라우저 Network의 `auth/v1/token` 또는 `rest/v1/rpc/record_login` 요청 Headers에 `apikey`가 있는지 확인한다.

## 2026-08-28 `rest/v1/rpc/record_login` HTTP 406

### 원인

`core`는 사용자 정의 스키마다. Supabase Data API의 Exposed schemas에 포함되지 않은 상태에서 `client.schema('core')`로 RPC 또는 테이블을 호출하면 PostgREST가 `PGRST106`과 HTTP 406을 반환한다. 기존 로그인 코드는 이 API 오류를 프로필의 `active = false`와 동일하게 취급해 잘못된 비활성 계정 안내를 표시했다.

### 해결 방법

1. Supabase Dashboard → Project Settings → Data API(또는 API) → Exposed schemas에 `core`와 `analytics`를 추가하고 저장한다.
2. SQL Editor에서 기존 Auth 사용자의 프로필 행을 backfill한다.

```sql
insert into core.app_user (user_id, email, name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'name', '')
from auth.users
on conflict (user_id) do nothing;

select user_id, email, role, active from core.app_user;
```

3. 로그인할 사용자의 `active`가 `true`인지 확인한다. 첫 관리자라면 해당 사용자만 `ADMIN`으로 변경한다.

```sql
update core.app_user
set role = 'ADMIN', active = true
where email = '관리자이메일@example.com';
```

## 2026-08-28 로그인 화면이 표시되지 않음

### 확인 결과

로그인 라우트는 `app/(auth)/login/page.tsx`에 존재한다. 현재 작업 환경에는 실행 중인 Next.js 서버(3000~3002 포트)가 없으므로, 로컬 브라우저에서 로그인 화면을 보려면 개발 서버를 먼저 실행해야 한다. 배포 화면을 보는 경우에는 로컬의 미커밋 변경이 반영되지 않는다.

### 확인 방법

1. 로컬에서는 프로젝트 폴더에서 `npm run dev`를 실행한 뒤 `http://localhost:3000/login`으로 직접 접속한다.
2. 배포 환경에서는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 배포 환경변수에 설정한 뒤 재배포한다.
3. 계속 표시되지 않으면 주소창의 전체 URL과 브라우저 오류 화면을 확인한다.

## 2026-08-28 인증 후 화면 전환 및 오류 원인 진단

### 적용한 보완

- 기존 `auth.users` 사용자를 `core.app_user`에 idempotent하게 backfill하는 migration을 추가했다.
- middleware가 모든 앱 경로에서 최신 Supabase 세션 쿠키를 응답에 반영하도록 수정했다. `/login`과 `/api/health/supabase`는 공개로 유지한다.
- 로그인 실패 화면에 Supabase 오류 코드를 함께 표시한다.

### 수동 설정

Supabase Dashboard → Project Settings → Data API → Exposed schemas에 `public`, `core`, `analytics`를 저장해야 한다. 이 설정은 SQL migration이나 Git push로 적용되지 않는다.

## 2026-08-28 STEP 3 Forecast 학습/검증 데이터 격리 설정

### 적용 순서

1. `raw.usage_history`가 없는 프로젝트에서는 먼저 `supabase/migrations/20260828000050_create_raw_usage_history_base.sql` 전체를 실행한다. 이 파일은 테이블만 만들며 기존 데이터를 삭제하거나 예제 데이터를 적재하지 않는다.
2. Supabase SQL Editor에서 `supabase/migrations/20260828000300_create_forecast_data_isolation.sql` 전체를 실행한다.
3. Project Settings → Data API → Exposed schemas에 `raw`, `core`, `analytics`를 추가하고 저장한다. `raw`는 적재 API에서만 필요하며, 일반 화면은 `core`와 `analytics` view만 조회한다.
4. 아래 쿼리로 자동 생성된 기간과 데이터 격리를 확인한다.

```sql
select *
from analytics.v_data_coverage;
```

### 정상 기준

- `train_window_ok`, `test_window_ok`, `data_isolation_ok`가 모두 `true`여야 한다.
- `train_end`는 반드시 `test_start`보다 이전이어야 한다.
- 학습 또는 검증 데이터가 부족하면 migration은 임의 날짜나 0을 만들지 않고 `core.forecast_setting` 초기 행을 생성하지 않는다.

### 데이터 부족 또는 기간 변경

`core.forecast_setting`은 관리자만 수정할 수 있다. 사용 이력이 두 날짜 이상 있고 기간을 운영 기준으로 조정해야 할 때만 ADMIN 계정으로 다음처럼 변경한다.

```sql
update core.forecast_setting
set train_start = date '2025-01-01',
    train_end = date '2025-09-30',
    test_start = date '2025-10-01',
    test_end = date '2025-12-31',
    granularity = 'DAILY'
where setting_key = true;
```

위 날짜는 예시다. 실제 사용 이력의 시작/종료 범위 안에서 설정해야 하며, 미래 actual을 학습 기간에 포함하면 안 된다.

### 기존 public migration의 `planning_run_id` 오류

`20260813000100_create_procurement_demand_core.sql`은 기존 public 테이블의 컬럼을 보완하지 않는다. 따라서 기존 `historical_actuals`에 `planning_run_id`가 없으면 인덱스 생성에서 실패할 수 있다. 이 오류는 STEP 3과 무관하므로 해당 base migration을 재실행하지 말고, 먼저 테이블 구조와 행 수를 확인한 뒤 데이터 보존 방식으로 별도 보완한다.

## 2026-09-04 PowerShell에서 npm 실행 차단

### 증상

PowerShell에서 `npm test` 실행 시 `npm.ps1`을 로드할 수 없다는 `PSSecurityException`이 발생한다.

### 원인

PowerShell 실행 정책이 `.ps1` 스크립트 실행을 차단하고 있다. Node.js나 프로젝트 코드의 오류가 아니다.

### 해결 방법

권한이나 실행 정책을 변경하지 않고 Windows 명령 실행 파일을 직접 호출한다.

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
```

정책을 변경할 수 있는 개인 PC에서만 PowerShell 사용자 범위에 허용할 수도 있다.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
