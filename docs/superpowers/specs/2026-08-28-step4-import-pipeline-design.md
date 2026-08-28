# STEP 4 데이터 Import Pipeline 설계

## 목적

CSV와 Excel 파일을 서버에서 파싱하고, 사용자가 확정한 컬럼 매핑과 검증 결과를 거쳐서만 RAW 계층으로 적재한다. 모든 적재는 batch 단위로 추적하며, 오류 이력, 다운로드, rollback 및 Forecast stale 신호를 제공한다.

## 지원 Import Type

첫 릴리스는 실제 RAW 구조와 STEP 3 신규 테이블이 있는 다음 타입만 지원한다.

| Import type | RAW 대상 | 표준 키/검증 기준 |
| --- | --- | --- |
| `usage_history` | `raw.usage_history` | `usage_id`, `item_id`, `use_date`, `qty` |
| `inventory` | `raw.inventory` | 품목코드, 창고, 기준일자 |
| `item_master` | `raw.item_master` | 품목코드 |
| `supplier_master` | `raw.supplier_master` | 공급업체코드 |
| `purchase_order` | `raw.purchase_order` | 발주번호, 품목코드 |
| `goods_receipt` | `raw.goods_receipt` | 입고번호, 품목코드 |
| `sales_order` | `raw.sales_order` | order_no, line_no |
| `business_event` | `raw.business_event` | source_record_id 또는 business_event_id |

`shipment_log`, `forecast`, `item_substitute`는 실제 RAW 테이블에 존재하더라도 STEP 4 UI에서는 지원하지 않는다.

## 서버 중심 흐름

```text
파일 선택 + import type + mode
  → 서버 parse (CSV: papaparse, XLSX: xlsx)
  → upload_batch / import_staging 생성
  → 자동 매핑 제안 + 사용자 매핑 확정
  → 단일 validate 모듈 실행
  → validation_error 저장 + preview/error CSV
  → ADMIN 사용자 승인
  → DB RPC가 정상 행만 RAW 적재
  → batch history / stale signal
```

브라우저는 파일 선택과 매핑/결과 표시만 담당한다. 수만 행 parsing·validation·RAW 적재는 서버와 DB에서 수행한다.

## DB 객체

- `core.upload_batch`: batch id, 파일/유형/모드, 집계 행 수, 상태, 업로드/적재 사용자 및 시간, rollback 가능 여부
- `core.import_staging`: 원본 행 JSON, 표준화 후보 JSON, 매핑 확정 여부, validation 상태
- `core.column_mapping`: import type·원본 헤더·표준 필드의 재사용 가능한 매핑
- `core.validation_error`: batch/행/필드별 오류 코드, 메시지, severity, 원본 값
- `core.import_rollback_snapshot`: upsert 이전의 파일 적재 RAW 행 JSON과 원래 provenance
- `core.forecast_data_change`: 수요 영향 batch의 최신 데이터 변경 시각과 source batch
- `core.import_batch_summary` view: History 화면의 안전한 조회 모델

모든 관리 테이블은 RLS를 켜고, active authenticated 사용자는 자신의 batch만 조회하며 ADMIN은 전체 조회 및 mutation을 수행한다. import/rollback RPC는 `core.is_admin()`을 첫 단계에서 확인한다.

## 매핑과 검증

`lib/import/schema.ts`가 타입별 표준 필드, RAW 대상 컬럼, 필수값, 자연키, 수요 영향 여부를 정의한다. `lib/import/parse.ts`는 CSV/XLSX 행과 헤더만 만든다. `lib/import/validate.ts`는 모든 타입이 공유하는 다음 검증을 수행한다.

- 필수 컬럼/필수값 누락
- 숫자와 날짜 형식
- 파일 안 duplicate 및 대상 자연키 duplicate
- 품목/공급처 마스터 존재 여부
- 음수 수량 금지(반품 등 타입별 명시적 예외 제외)
- 발주일과 입고일 등 날짜 관계
- 매핑되지 않은 필수 표준 필드

검증 불가 값은 수정·추정·0 치환하지 않는다. 행은 staging에 유지하고 `reason_code`와 설명을 `core.validation_error`에 기록한다. ERROR가 하나라도 있으면 import RPC를 호출할 수 없다. WARNING은 사용자가 확인하면 정상 행과 함께 적재할 수 있다.

## 적재 모드와 rollback

| 모드 | 동작 | rollback |
| --- | --- | --- |
| append | 정상 행을 새 RAW 행으로 추가 | 해당 `batch_id` 행만 삭제 |
| upsert | 자연키가 같은 기존 파일 적재 행을 snapshot 후 교체, 없으면 추가 | 새 batch 삭제 후 snapshot 복원 |
| replace | 해당 import type의 기존 파일 적재 행을 교체 | 지원하지 않음; ADMIN 확인 문구 필요 |

모든 적재 행은 `batch_id`, `source_type = 'FILE_UPLOAD'`, `loaded_at`, `source_record_id`를 채운다. replace는 파일 적재 데이터에만 적용하며, API/legacy source 데이터는 삭제하지 않는다.

## Forecast stale

`usage_history`, `sales_order`, `business_event` batch가 적재되면 `core.forecast_data_change`를 갱신한다. 현재 Forecast Run 저장소는 없으므로 forecast 결과를 생성·수정·삭제하지 않는다. STEP 6은 run의 `data_snapshot_at`과 이 신호를 비교해 stale 여부를 표시한다.

## UI와 보안

`/admin/data-management`는 File Upload, Import History, Validation Errors 영역을 가진다. 파일 전송/매핑/검증/승인/rollback Server Action 또는 Route Handler는 `requireAdmin()`을 호출한다. anon과 USER의 직접 호출은 DB RPC와 RLS에서 거부된다. service role key는 사용하지 않는다.

## 검증

순수 import 모듈 테스트는 CSV/XLSX parsing, 매핑 제안, ERROR/WARNING 판정, duplicate와 날짜 관계를 검증한다. migration 테스트는 staging/RLS/RPC/provenance를 점검한다. 전체 `npm test` 및 `npm run build`를 실행한다.
