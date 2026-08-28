create extension if not exists pgcrypto;

create schema if not exists raw;
create schema if not exists core;
create schema if not exists analytics;

-- Step 3 extends the established raw model. A missing demand source must fail
-- explicitly rather than create empty views that conceal an incomplete setup.
do $$
begin
  if to_regclass('raw.usage_history') is null then
    raise exception 'STEP 3 requires raw.usage_history. Apply the base raw schema before this migration.'
      using errcode = '42P01';
  end if;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'shipment_log',
    'supplier_master',
    'item_master',
    'inventory',
    'usage_history',
    'purchase_order',
    'goods_receipt',
    'forecast'
  ]
  loop
    if to_regclass(format('raw.%I', target_table)) is not null then
      execute format('alter table raw.%I add column if not exists batch_id uuid', target_table);
      execute format('alter table raw.%I add column if not exists source_type text', target_table);
      execute format('alter table raw.%I add column if not exists loaded_at timestamptz', target_table);
      execute format('alter table raw.%I add column if not exists source_record_id text', target_table);
    end if;
  end loop;
end $$;

create table if not exists raw.business_event (
  business_event_id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_type text not null,
  item_id text,
  qty numeric,
  note text,
  batch_id uuid,
  source_type text,
  loaded_at timestamptz,
  source_record_id text
);

create index if not exists business_event_item_date_idx
  on raw.business_event (item_id, event_date);

create table if not exists raw.sales_order (
  sales_order_id uuid primary key default gen_random_uuid(),
  order_no text not null,
  line_no integer not null check (line_no > 0),
  order_date date not null,
  requested_date date,
  item_id text not null,
  qty numeric not null check (qty > 0),
  status text,
  customer_name text,
  batch_id uuid,
  source_type text,
  loaded_at timestamptz,
  source_record_id text,
  unique (order_no, line_no)
);

create index if not exists sales_order_item_date_idx
  on raw.sales_order (item_id, order_date);

create table if not exists raw.item_substitute (
  item_substitute_id uuid primary key default gen_random_uuid(),
  item_id text not null,
  substitute_item_id text not null,
  priority integer not null default 1 check (priority > 0),
  valid_from date,
  valid_to date,
  active boolean not null default true,
  batch_id uuid,
  source_type text,
  loaded_at timestamptz,
  source_record_id text,
  check (item_id <> substitute_item_id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index if not exists item_substitute_item_active_idx
  on raw.item_substitute (item_id, active, priority);

alter table if exists raw.business_event add column if not exists batch_id uuid;
alter table if exists raw.business_event add column if not exists source_type text;
alter table if exists raw.business_event add column if not exists loaded_at timestamptz;
alter table if exists raw.business_event add column if not exists source_record_id text;
alter table if exists raw.sales_order add column if not exists batch_id uuid;
alter table if exists raw.sales_order add column if not exists source_type text;
alter table if exists raw.sales_order add column if not exists loaded_at timestamptz;
alter table if exists raw.sales_order add column if not exists source_record_id text;
alter table if exists raw.item_substitute add column if not exists batch_id uuid;
alter table if exists raw.item_substitute add column if not exists source_type text;
alter table if exists raw.item_substitute add column if not exists loaded_at timestamptz;
alter table if exists raw.item_substitute add column if not exists source_record_id text;

-- A partially-created raw table must not be mistaken for a compatible model on
-- a retry. Validate the required fields and fail with a precise migration error.
do $$
declare
  target_table text;
  required_column text;
begin
  foreach target_table in array array['business_event', 'sales_order', 'item_substitute']
  loop
    foreach required_column in array array['batch_id', 'source_type', 'loaded_at', 'source_record_id']
    loop
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'raw'
          and table_name = target_table
          and column_name = required_column
      ) then
        raise exception 'raw.% is missing required column %', target_table, required_column;
      end if;
    end loop;
  end loop;
end $$;

create table if not exists core.policy_config (
  setting_key boolean primary key default true check (setting_key),
  default_service_level numeric(5,4) check (
    default_service_level is null or default_service_level > 0 and default_service_level < 1
  ),
  review_period_days integer check (review_period_days is null or review_period_days > 0),
  safety_buffer_days integer check (safety_buffer_days is null or safety_buffer_days >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into core.policy_config (setting_key)
values (true)
on conflict (setting_key) do nothing;

create table if not exists core.outlier_rule (
  rule_code text primary key,
  rule_type text not null check (rule_type in ('PROJECT', 'RETURN', 'DUPLICATE', 'EXCLUDE')),
  enabled boolean not null default true,
  priority integer not null default 100 check (priority >= 0),
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.item_policy (
  item_id text primary key,
  moq numeric check (moq is null or moq > 0),
  pack_size numeric check (pack_size is null or pack_size > 0),
  item_grade text,
  service_level numeric(5,4) check (service_level is null or service_level > 0 and service_level < 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.forecast_setting (
  setting_key boolean primary key default true check (setting_key),
  train_start date not null,
  train_end date not null,
  test_start date not null,
  test_end date not null,
  granularity text not null check (granularity in ('DAILY', 'WEEKLY', 'MONTHLY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (train_start <= train_end),
  check (test_start <= test_end),
  check (train_end < test_start)
);

do $$
begin
  if to_regclass('raw.usage_history') is not null then
    insert into core.forecast_setting (
      setting_key,
      train_start,
      train_end,
      test_start,
      test_end,
      granularity
    )
    with bounds as (
      select min(use_date) as first_date, max(use_date) as last_date
      from raw.usage_history
      where use_date is not null
    ), split as (
      select
        first_date,
        last_date,
        first_date + floor(((last_date - first_date + 1) * 0.8))::integer as test_start
      from bounds
      where last_date > first_date
    )
    select
      true,
      first_date,
      test_start - 1,
      test_start,
      last_date,
      'DAILY'
    from split
    on conflict (setting_key) do nothing;
  end if;
end $$;

drop trigger if exists policy_config_updated_at on core.policy_config;
create trigger policy_config_updated_at
before update on core.policy_config
for each row execute function core.touch_updated_at();

drop trigger if exists outlier_rule_updated_at on core.outlier_rule;
create trigger outlier_rule_updated_at
before update on core.outlier_rule
for each row execute function core.touch_updated_at();

drop trigger if exists item_policy_updated_at on core.item_policy;
create trigger item_policy_updated_at
before update on core.item_policy
for each row execute function core.touch_updated_at();

drop trigger if exists forecast_setting_updated_at on core.forecast_setting;
create trigger forecast_setting_updated_at
before update on core.forecast_setting
for each row execute function core.touch_updated_at();

create or replace function core.is_active_user()
returns boolean language sql stable security definer set search_path = core, public as $$
  select exists (
    select 1
    from core.app_user
    where user_id = auth.uid()
      and active = true
  );
$$;

-- Forecast and demand-profile readers must use this view instead of querying
-- raw.usage_history directly. The configured boundary is the single source of
-- truth, so test-period actuals cannot enter model training.
create or replace view core.v_train_demand as
select
  usage.usage_id,
  usage.item_id,
  usage.use_date,
  usage.qty,
  usage.warehouse,
  usage.note,
  usage.batch_id,
  usage.source_type,
  usage.loaded_at,
  usage.source_record_id
from core.forecast_setting as setting
join raw.usage_history as usage on true
where usage.use_date between setting.train_start and setting.train_end
  and core.is_active_user();

-- Backtest scoring reads only the held-out actuals through this view.
create or replace view core.v_test_actual as
select
  usage.usage_id,
  usage.item_id,
  usage.use_date,
  usage.qty,
  usage.warehouse,
  usage.note,
  usage.batch_id,
  usage.source_type,
  usage.loaded_at,
  usage.source_record_id
from core.forecast_setting as setting
join raw.usage_history as usage on true
where usage.use_date between setting.test_start and setting.test_end
  and core.is_active_user();

create or replace view analytics.v_data_coverage as
with data_bounds as (
  select
    min(use_date) as data_start,
    max(use_date) as data_end
  from raw.usage_history
  where use_date is not null
), row_counts as (
  select
    (select count(*) from core.v_train_demand) as train_row_count,
    (select count(*) from core.v_test_actual) as test_row_count
)
select
  bounds.data_start,
  bounds.data_end,
  setting.train_start,
  setting.train_end,
  setting.test_start,
  setting.test_end,
  setting.granularity,
  counts.train_row_count,
  counts.test_row_count,
  coalesce(
    setting.train_start >= bounds.data_start
    and setting.train_end <= bounds.data_end
    and setting.train_start <= setting.train_end
    and counts.train_row_count > 0,
    false
  ) as train_window_ok,
  coalesce(
    setting.test_start >= bounds.data_start
    and setting.test_end <= bounds.data_end
    and setting.test_start <= setting.test_end
    and counts.test_row_count > 0,
    false
  ) as test_window_ok,
  coalesce(setting.train_end < setting.test_start, false) as data_isolation_ok
from data_bounds as bounds
left join core.forecast_setting as setting on true
cross join row_counts as counts
where core.is_active_user();

-- The admin settings screen can consume one stable, read-only relation.
create or replace view analytics.v_forecast_settings as
select
  coverage.*,
  policy.default_service_level,
  policy.review_period_days,
  policy.safety_buffer_days,
  policy.settings as policy_settings
from analytics.v_data_coverage as coverage
left join core.policy_config as policy on policy.setting_key;

-- Raw ingestion tables have no direct authenticated access. Their data is
-- exposed only by approved views, while admin-managed configuration tables use
-- the reusable core.is_admin() predicate for every mutation.
revoke all on schema raw from anon, authenticated;
revoke all on schema core from anon;
revoke all on schema analytics from anon;
revoke all on all tables in schema raw from anon, authenticated;
revoke all on all tables in schema core from anon;
revoke all on all tables in schema analytics from anon;

grant usage on schema core, analytics to authenticated;
grant execute on function core.is_active_user() to authenticated;
grant select on core.policy_config, core.outlier_rule, core.item_policy, core.forecast_setting to authenticated;
grant select on core.v_train_demand, core.v_test_actual to authenticated;
grant select on analytics.v_data_coverage, analytics.v_forecast_settings to authenticated;
grant insert, update, delete on core.policy_config, core.outlier_rule, core.item_policy, core.forecast_setting to authenticated;

alter table raw.business_event enable row level security;
alter table raw.sales_order enable row level security;
alter table raw.item_substitute enable row level security;
alter table core.policy_config enable row level security;
alter table core.outlier_rule enable row level security;
alter table core.item_policy enable row level security;
alter table core.forecast_setting enable row level security;

drop policy if exists policy_config_authenticated_select on core.policy_config;
create policy policy_config_authenticated_select on core.policy_config
for select to authenticated using (core.is_active_user());
drop policy if exists policy_config_admin_mutation on core.policy_config;
create policy policy_config_admin_mutation on core.policy_config
for all to authenticated using (core.is_admin()) with check (core.is_admin());

drop policy if exists outlier_rule_authenticated_select on core.outlier_rule;
create policy outlier_rule_authenticated_select on core.outlier_rule
for select to authenticated using (core.is_active_user());
drop policy if exists outlier_rule_admin_mutation on core.outlier_rule;
create policy outlier_rule_admin_mutation on core.outlier_rule
for all to authenticated using (core.is_admin()) with check (core.is_admin());

drop policy if exists item_policy_authenticated_select on core.item_policy;
create policy item_policy_authenticated_select on core.item_policy
for select to authenticated using (core.is_active_user());
drop policy if exists item_policy_admin_mutation on core.item_policy;
create policy item_policy_admin_mutation on core.item_policy
for all to authenticated using (core.is_admin()) with check (core.is_admin());

drop policy if exists forecast_setting_authenticated_select on core.forecast_setting;
create policy forecast_setting_authenticated_select on core.forecast_setting
for select to authenticated using (core.is_active_user());
drop policy if exists forecast_setting_admin_mutation on core.forecast_setting;
create policy forecast_setting_admin_mutation on core.forecast_setting
for all to authenticated using (core.is_admin()) with check (core.is_admin());
