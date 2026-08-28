-- 기존 dump.sql은 DROP 구문을 포함하므로 운영 DB bootstrap에 사용하지 않는다.
-- 이 migration은 STEP 3의 최소 선행 구조만 비파괴적으로 만든다.
create schema if not exists raw;

create table if not exists raw.usage_history (
  usage_id text,
  item_id text,
  use_date date,
  qty numeric,
  warehouse text,
  note text
);

create index if not exists usage_history_item_date_idx
  on raw.usage_history (item_id, use_date);
