create extension if not exists pgcrypto;

create schema if not exists raw;
create schema if not exists core;
create schema if not exists analytics;

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
    execute format('alter table raw.%I add column if not exists batch_id uuid', target_table);
    execute format('alter table raw.%I add column if not exists source_type text', target_table);
    execute format('alter table raw.%I add column if not exists loaded_at timestamptz', target_table);
    execute format('alter table raw.%I add column if not exists source_record_id text', target_table);
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
insert into core.forecast_setting (
  setting_key,
  train_start,
  train_end,
  test_start,
  test_end,
  granularity
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

