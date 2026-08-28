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
