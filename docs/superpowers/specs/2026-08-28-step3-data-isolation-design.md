# STEP 3 데이터 모델 확장 및 학습·검증 격리 설계

## 목적

STEP 4 파일 업로드, STEP 5 수요 패턴 분석, STEP 6 Forecast Engine이 공통으로 사용할 원본 적재 추적·운영 정책·학습/검증 경계를 데이터베이스에 확정한다. 학습 코드가 검증 기간의 actual을 읽지 못하도록 기간 경계를 DB view로 강제한다.

## 현재 상태와 제약

- `raw.usage_history`는 `usage_id`, `item_id`, `use_date`, `qty`, `warehouse`, `note`를 가진 기존 사용 이력이다.
- 현재 `core.v_usage_effective`, `analytics.v_usage_profile`은 전체 사용 이력을 읽는다. 기존 Stockout 분석의 동작을 바꾸지 않기 위해 STEP 3에서 이 view들은 변경하지 않는다.
- 기존 raw 테이블은 자연키가 일관되게 선언되어 있지 않다. 따라서 새 raw 테이블의 품목 컬럼에 기존 raw 테이블 FK를 강제하지 않는다.
- `core.is_admin()` 및 STEP 2의 RLS 구조를 재사용한다.

## 변경 범위

새 migration `supabase/migrations/20260828000300_create_forecast_data_isolation.sql`에서 아래 작업을 idempotent하게 수행한다.

### Raw 적재 추적

대상은 기존 `raw.shipment_log`, `raw.supplier_master`, `raw.item_master`, `raw.inventory`, `raw.usage_history`, `raw.purchase_order`, `raw.goods_receipt`, `raw.forecast`와 새 raw 테이블 3개다.

각 테이블에 다음 nullable 컬럼을 `ADD COLUMN IF NOT EXISTS`로 추가한다.

| 컬럼 | 타입 | 정책 |
|---|---|---|
| `batch_id` | uuid | 기존 행은 null. STEP 4/19 적재 묶음 식별자 |
| `source_type` | text | 기존 행은 null. 파일/API/수기 등 적재 주체 |
| `loaded_at` | timestamptz | 기존 행은 null. 실제 적재 시각 |
| `source_record_id` | text | 원천 레코드 식별자 |

기존 데이터의 실제 출처·적재 시각을 추정하지 않기 위해 migration에서 기본값 또는 임의의 `LEGACY` 값을 채우지 않는다. 이후 적재 서비스가 네 컬럼을 명시적으로 기록한다.

### 새 raw 테이블

| 테이블 | PK | 핵심 컬럼 |
|---|---|---|
| `raw.business_event` | `business_event_id uuid` | `event_date`, `event_type`, `item_id`, `qty`, `note` |
| `raw.sales_order` | `sales_order_id uuid` | `order_no`, `line_no`, `order_date`, `requested_date`, `item_id`, `qty`, `status`, `customer_name` |
| `raw.item_substitute` | `item_substitute_id uuid` | `item_id`, `substitute_item_id`, `priority`, `valid_from`, `valid_to`, `active` |

각 테이블은 적재 추적 컬럼을 포함하고, 날짜/수량/우선순위/자기대체 금지 제약 및 조회 인덱스를 둔다. 새 테이블의 PK는 `gen_random_uuid()`를 사용한다. 기존 raw 마스터에 신뢰할 수 있는 PK가 없으므로 item FK는 만들지 않는다.

### 운영 정책과 Forecast 설정

| 테이블 | 구조 | 용도 |
|---|---|---|
| `core.policy_config` | singleton 행, `default_service_level`, `review_period_days`, `safety_buffer_days`, `settings jsonb`, timestamps | 공통 운영 정책 |
| `core.outlier_rule` | `rule_code` PK, `rule_type`, `enabled`, `priority`, `parameters jsonb`, timestamps | 프로젝트/반품/중복/학습제외 기준 |
| `core.item_policy` | `item_id` PK, `moq`, `pack_size`, `item_grade`, `service_level`, `active`, timestamps | 품목별 운영 정책 |
| `core.forecast_setting` | singleton 행, `train_start`, `train_end`, `test_start`, `test_end`, `granularity`, timestamps | 학습·검증 기간 경계 |

정책 값은 화면 또는 TypeScript 코드에 선언하지 않는다. 값의 생성·수정은 DB 설정 테이블에서만 수행한다.

`forecast_setting`은 migration 시 `raw.usage_history`의 최소/최대 `use_date`가 있고 기간이 2일 이상이면 한 번 생성한다. 전체 날짜 범위의 앞 80%는 train, 뒤 20%는 test가 된다. 이 계산은 migration SQL에서 데이터로부터 산출하며 날짜 리터럴을 쓰지 않는다. 이후 데이터가 추가되어도 설정 행은 자동으로 움직이지 않으며, ADMIN이 검토 후 변경해야 backtest 재현성이 보장된다.

### 학습·검증 데이터 경계

`core.v_train_demand`는 singleton `forecast_setting`의 train 기간만 반환한다. `core.v_test_actual`은 test 기간만 반환한다. 두 view는 `raw.usage_history`의 null 날짜를 제외하고, 원본의 qty와 null을 그대로 유지한다. null을 0으로 변환하지 않는다.

향후 역할 분리는 다음과 같다.

```text
raw.usage_history -> core.v_train_demand -> Forecast / Demand Profile
raw.usage_history -> core.v_test_actual  -> Backtest scoring
```

STEP 5/6 코드에는 이 view를 사용하는 repository 함수만 추가한다. 해당 코드가 `raw.usage_history`를 직접 호출하는 것은 금지한다. 기존 운영 분석 view는 기능 보존을 위해 이번 단계에서 변경하지 않는다.

### 관리자 검증 view

`analytics.v_data_coverage`는 한 행에 아래를 제공한다.

- raw 전체 시작·종료일
- train/test 시작·종료일과 granularity
- train/test row count
- `train_window_ok`, `test_window_ok`
- train/test 날짜 overlap 여부와 종합 `data_isolation_ok`

`analytics.v_forecast_settings`는 `v_data_coverage`에 `policy_config`의 서비스 수준·검토 주기·버퍼·추가 설정을 결합한다. `/admin/forecast-settings`는 이 view만 읽으면 기간, 격리 상태, 정책을 한 화면에서 표시할 수 있다.

`*_window_ok`는 설정값 존재, 기간 순서, 전체 데이터 범위 포함, 해당 window 행 수가 1건 이상일 때만 true다. 설정이 없거나 범위를 벗어나면 false다.

## 권한 및 RLS

- anon: 새 raw/core/analytics 객체의 schema usage, table privilege, 정책 모두 부여하지 않는다.
- authenticated: train/test 및 analytics 검증 view와 policy 설정을 조회할 수 있다.
- authenticated ADMIN: `core.policy_config`, `core.outlier_rule`, `core.item_policy`, `core.forecast_setting`의 mutation을 허용한다.
- authenticated USER: 위 정책 테이블의 mutation을 RLS로 거부한다.
- raw 신규 테이블은 RLS를 활성화하고 direct API DML 권한을 부여하지 않는다. STEP 4/19의 서버 적재 경로가 별도 권한으로 처리한다.

## 검증 전략

1. SQL migration 정적 테스트로 신규 테이블, 추적 컬럼, view, RLS 선언을 확인한다.
2. TypeScript 테스트로 Forecast repository가 train/test view 이름만 사용하고 raw usage history를 직접 참조하지 않는지 확인한다.
3. Supabase SQL Editor에서 coverage query를 실행한다.

```sql
select * from analytics.v_data_coverage;
select * from analytics.v_forecast_settings;
select count(*) from core.v_train_demand t join core.v_test_actual v on t.use_date = v.use_date and t.usage_id = v.usage_id;
```

마지막 쿼리의 결과는 0이어야 한다.

## 수동 설정

- 기존 원격 Supabase에는 migration SQL을 적용해야 한다.
- Supabase Data API Exposed schemas에는 `public`, `core`, `analytics`가 있어야 한다.
- 자동 생성된 80/20 기간은 ADMIN이 `/admin/forecast-settings` 구현 후 검토·조정할 수 있다.
