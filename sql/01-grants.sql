-- STEP 2 권한 기준. anon에는 업무 스키마를 노출하지 않습니다.
create schema if not exists analytics;
revoke all on schema core from anon;
revoke all on schema analytics from anon;
revoke all on all tables in schema core from anon;
revoke all on all tables in schema analytics from anon;

grant usage on schema core to authenticated;
grant usage on schema analytics to authenticated;
grant select on all tables in schema core to authenticated;
grant select on all tables in schema analytics to authenticated;

alter default privileges in schema core grant select on tables to authenticated;
alter default privileges in schema analytics grant select on tables to authenticated;

-- 변경은 core.admin_* RPC와 RLS를 통해서만 허용합니다.
revoke insert, update, delete on core.leadtime_plan from anon, authenticated;
revoke insert, update, delete on core.usage_profile from anon, authenticated;
