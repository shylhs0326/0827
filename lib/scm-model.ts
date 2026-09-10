export type LeadtimeGap = {
  supplier: string;
  country: string;
  masterLeadTime: number | null;
  sampleCount: number;
  actualAverage: number | null;
  p80: number | null;
  gap: number | null;
};

export type StockoutRiskStatus = 'SAFE' | 'CRITICAL' | 'UNKNOWN';
export type StockoutReason = 'NO_USAGE' | 'NO_LEADTIME' | null;

export type StockoutRisk = {
  itemId: string;
  itemName: string;
  supplierId: string;
  currentStock: number | null;
  inboundQty: number | null;
  availableQty: number | null;
  dailyUsageAverage: number | null;
  cv: number | null;
  plannedLeadTime: number | null;
  stockoutDays: number | null;
  stockoutDate: string | null;
  riskStatus: StockoutRiskStatus;
  reason: StockoutReason;
};

export type StockoutKpi = {
  items: number;
  critical: number;
  safe: number;
  unknown: number;
  within30Days: number;
  averageStockoutDays: number | null;
};

export type ShipmentMonth = {
  ym: string;
  quantity: number | null;
};

export type ShipmentTrend = {
  itemCode: string;
  description: string | null;
  family: string | null;
  itemType: string | null;
  dataAsOf: string | null;
  firstYm: string | null;
  lastYm: string | null;
  monthsSinceLast: number | null;
  span: number | null;
  totalQty: number | null;
  latestQty: number | null;
  monthly: ShipmentMonth[];
  average3Months: number | null;
  average6Months: number | null;
  average12Months: number | null;
  trend3mVs12m: number | null;
  reasonCode: string | null;
};

export type DemandProfile = {
  itemCode: string;
  description: string | null;
  family: string | null;
  itemType: string | null;
  dataAsOf: string | null;
  firstYm: string | null;
  lastYm: string | null;
  periods: number | null;
  nonzeroMonths: number | null;
  meanNonzeroQty: number | null;
  itemName: string | null;
  adi: number | null;
  cvSquared: number | null;
  noDemandRate: number | null;
  demandType: string | null;
  reasonCode: string | null;
};

export type OlAccuracy = {
  modelBase: string | null;
  fySheet: string | null;
  biz: string | null;
  rows: number | null;
  firstYm: string | null;
  lastYm: string | null;
  totalAct: number | null;
  scoredSales: number | null;
  salesWape: number | null;
  salesBias: number | null;
  scoredScm: number | null;
  scmWape: number | null;
  scmBias: number | null;
  scored: number | null;
  source: 'MODEL' | 'FY_TOTAL';
  reasonCode: string | null;
};

export type ItemDemandProfile = {
  itemCode: string;
  description: string;
  family: string | null;
  itemType: string | null;
  dataAsOf: string | null;
  firstYm: string | null;
  lastYm: string | null;
  nPeriods: number;
  nNonzero: number;
  meanNonzeroQty: number | null;
  adi: number | null;
  zeroDemandRate: number | null;
  cvSquared: number | null;
  demandType: 'SMOOTH' | 'INTERMITTENT' | 'ERRATIC' | 'LUMPY' | null;
  reasonCode: string | null;
};

export type ItemDemandKpi = {
  itemType: string;
  nItems: number;
  nSmooth: number;
  nErratic: number;
  nIntermittent: number;
  nLumpy: number;
  nUnknown: number;
  nCrostonCandidate: number;
};

export type OlAccuracyFy = {
  fySheet: string;
  rows: number;
  scored: number;
  salesWape: number | null;
  scmWape: number | null;
  salesBias: number | null;
  scmBias: number | null;
};

export type BomRequirement = {
  modelBase: string | null;
  modelKey: string | null;
  partRole: string | null;
  itemCode: string | null;
  description: string | null;
  quantity: number | null;
  bomGroup: string | null;
  nModels: number | null;
  commonFlag: string | null;
  commonNote: string | null;
};

function value(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function numberValue(row: Record<string, unknown>, keys: string[]) {
  const raw = value(row, keys);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(row: Record<string, unknown>, keys: string[]) {
  const raw = value(row, keys);
  return raw === null ? null : String(raw);
}

function stockoutStatusValue(row: Record<string, unknown>): StockoutRiskStatus {
  const status = textValue(row, ['risk_status', 'riskStatus', '위험도']);
  return status === 'CRITICAL' || status === 'SAFE' ? status : 'UNKNOWN';
}

function stockoutReasonValue(row: Record<string, unknown>): StockoutReason {
  const reason = textValue(row, ['reason', '사유']);
  return reason === 'NO_USAGE' || reason === 'NO_LEADTIME' ? reason : null;
}

export function normalizeLeadtimeGap(row: Record<string, unknown>): LeadtimeGap {
  return {
    supplier: String(value(row, ['supplier_name', 'supplier', '법인', '공급처', '공급업체명']) ?? '미정'),
    country: String(value(row, ['country', '국가']) ?? '미정'),
    masterLeadTime: numberValue(row, ['std_lead_time', 'master_lt', 'master_lead_time', 'planned_lead_time', '표준리드타임', '표준리드타임(일)', '마스터값']),
    sampleCount: numberValue(row, ['n_samples', 'sample_count', 'samples', '표본수']) ?? 0,
    actualAverage: numberValue(row, ['mean_days', 'actual_avg', 'actual_average', 'avg_lead_time', '실적평균']),
    p80: numberValue(row, ['p80_days', 'p80', 'P80']),
    gap: numberValue(row, ['gap_days', 'gap', 'leadtime_gap', '격차']),
  };
}

export function normalizeStockoutRisk(row: Record<string, unknown>): StockoutRisk {
  return {
    itemId: textValue(row, ['item_id', 'itemId', '품목코드']) ?? '미정',
    itemName: textValue(row, ['item_name', 'itemName', '품목명']) ?? '미정',
    supplierId: textValue(row, ['supplier_id', 'supplierId', '공급처']) ?? '미정',
    currentStock: numberValue(row, ['current_stock', 'currentStock', '현재고']),
    inboundQty: numberValue(row, ['inbound_qty', 'inboundQty', '입고예정']),
    availableQty: numberValue(row, ['available_qty', 'availableQty', '가용재고']),
    dailyUsageAverage: numberValue(row, ['daily_usage_avg', 'dailyUsageAverage', '일평균사용량']),
    cv: numberValue(row, ['cv', '변동계수']),
    plannedLeadTime: numberValue(row, ['planned_lead_time', 'plannedLeadTime', '계획리드타임']),
    stockoutDays: numberValue(row, ['stockout_days', 'stockoutDays', '소진예상일']),
    stockoutDate: textValue(row, ['stockout_date', 'stockoutDate', '소진예정일']),
    riskStatus: stockoutStatusValue(row),
    reason: stockoutReasonValue(row),
  };
}

export function normalizeStockoutKpi(row: Record<string, unknown>): StockoutKpi {
  return {
    items: numberValue(row, ['n_items', 'items', '전체품목수']) ?? 0,
    critical: numberValue(row, ['n_critical', 'critical', '고위험']) ?? 0,
    safe: numberValue(row, ['n_safe', 'safe', '안전']) ?? 0,
    unknown: numberValue(row, ['n_unknown', 'unknown', '판정불가']) ?? 0,
    within30Days: numberValue(row, ['n_within_30d', 'within30Days', '30일이내']) ?? 0,
    averageStockoutDays: numberValue(row, ['avg_stockout_days', 'averageStockoutDays', '평균소진일']),
  };
}

export function normalizeShipmentTrend(row: Record<string, unknown>): ShipmentTrend {
  return {
    itemCode: textValue(row, ['item_code', 'itemCode', '품목코드']) ?? '미정',
    description: textValue(row, ['description', '품목명']),
    family: textValue(row, ['family', '제품군']),
    itemType: textValue(row, ['item_type', 'itemType', '품목유형']),
    dataAsOf: textValue(row, ['data_as_of', 'dataAsOf', '기준월']),
    firstYm: textValue(row, ['first_ym', 'firstYm', '최초월']),
    lastYm: textValue(row, ['last_ym', 'lastYm', '최근월']),
    monthsSinceLast: numberValue(row, ['months_since_last', 'monthsSinceLast']),
    span: numberValue(row, ['n_span', 'span', '관측기간']),
    totalQty: numberValue(row, ['total_qty', 'totalQty', '총출고량']),
    latestQty: numberValue(row, ['latest_qty', 'latestQty', '최근수량']),
    monthly: Array.isArray(row.monthly)
      ? row.monthly.map((month) => ({
        ym: textValue(month as Record<string, unknown>, ['ym', '월']) ?? '미정',
        quantity: numberValue(month as Record<string, unknown>, ['qty', 'quantity', '수량']),
      }))
      : [],
    average3Months: numberValue(row, ['avg_3m', 'average_3_months', 'average3Months', '3개월평균']),
    average6Months: numberValue(row, ['avg_6m', 'average_6_months', 'average6Months', '6개월평균']),
    average12Months: numberValue(row, ['avg_12m', 'average_12_months', 'average12Months', '12개월평균']),
    trend3mVs12m: numberValue(row, ['trend_3m_vs_12m', 'trend3mVs12m']),
    reasonCode: textValue(row, ['reason_code', 'reasonCode', '사유코드']),
  };
}

function demandTypeValue(raw: unknown): ItemDemandProfile['demandType'] {
  return raw === 'SMOOTH' || raw === 'INTERMITTENT' || raw === 'ERRATIC' || raw === 'LUMPY' ? raw : null;
}

export function normalizeItemDemandProfile(row: Record<string, unknown>): ItemDemandProfile {
  return {
    itemCode: textValue(row, ['item_code', 'item_id', '품목코드']) ?? '미정',
    description: textValue(row, ['description', 'item_name', '품목명']) ?? '미정',
    family: textValue(row, ['family']),
    itemType: textValue(row, ['item_type']),
    dataAsOf: textValue(row, ['data_as_of', 'max_ym']),
    firstYm: textValue(row, ['first_ym']),
    lastYm: textValue(row, ['last_ym']),
    nPeriods: numberValue(row, ['n_periods', 'n_span']) ?? 0,
    nNonzero: numberValue(row, ['n_nonzero', 'n_nonzero_periods']) ?? 0,
    meanNonzeroQty: numberValue(row, ['mean_nonzero_qty']),
    adi: numberValue(row, ['adi']),
    zeroDemandRate: numberValue(row, ['zero_demand_rate', 'no_demand_rate']),
    cvSquared: numberValue(row, ['cv_squared', 'cv2']),
    demandType: demandTypeValue(value(row, ['demand_type'])),
    reasonCode: textValue(row, ['reason_code']),
  };
}

export function normalizeItemDemandKpi(row: Record<string, unknown>): ItemDemandKpi {
  return {
    itemType: textValue(row, ['item_type']) ?? '미정',
    nItems: numberValue(row, ['n_items']) ?? 0,
    nSmooth: numberValue(row, ['n_smooth']) ?? 0,
    nErratic: numberValue(row, ['n_erratic']) ?? 0,
    nIntermittent: numberValue(row, ['n_intermittent']) ?? 0,
    nLumpy: numberValue(row, ['n_lumpy']) ?? 0,
    nUnknown: numberValue(row, ['n_unknown']) ?? 0,
    nCrostonCandidate: numberValue(row, ['n_croston_candidate']) ?? 0,
  };
}

export function normalizeOlAccuracyFy(row: Record<string, unknown>): OlAccuracyFy {
  return {
    fySheet: textValue(row, ['fy_sheet', 'fiscal_year']) ?? '미정',
    rows: numberValue(row, ['n_rows', 'rows']) ?? 0,
    scored: numberValue(row, ['n_scored', 'scored']) ?? 0,
    salesWape: numberValue(row, ['sales_wape']),
    scmWape: numberValue(row, ['scm_wape']),
    salesBias: numberValue(row, ['sales_bias']),
    scmBias: numberValue(row, ['scm_bias']),
  };
}

export function normalizeDemandProfile(row: Record<string, unknown>): DemandProfile {
  return {
    itemCode: textValue(row, ['item_code', 'itemCode', '품목코드']) ?? '미정',
    description: textValue(row, ['description', '품목명']),
    family: textValue(row, ['family', '제품군']),
    itemType: textValue(row, ['item_type', 'itemType', '품목유형']),
    dataAsOf: textValue(row, ['data_as_of', 'dataAsOf', '기준월']),
    firstYm: textValue(row, ['first_ym', 'firstYm', '최초월']),
    lastYm: textValue(row, ['last_ym', 'lastYm', '최근월']),
    periods: numberValue(row, ['n_periods', 'periods', '관측기간']),
    nonzeroMonths: numberValue(row, ['n_nonzero', 'nonzeroMonths', '발생월수']),
    meanNonzeroQty: numberValue(row, ['mean_nonzero_qty', 'meanNonzeroQty']),
    itemName: textValue(row, ['item_name', 'itemName', '품목명']),
    adi: numberValue(row, ['adi', 'ADI']),
    cvSquared: numberValue(row, ['cv_squared', 'cv2', 'cvSquared', 'CV²']),
    noDemandRate: numberValue(row, ['no_demand_rate', 'noDemandRate', '무수요율']),
    demandType: textValue(row, ['demand_type', 'demandType', '수요유형']),
    reasonCode: textValue(row, ['reason_code', 'reasonCode', '사유코드']),
  };
}

export function normalizeOlAccuracy(
  row: Record<string, unknown>,
  source: OlAccuracy['source'] = 'MODEL',
): OlAccuracy {
  return {
    modelBase: textValue(row, ['model_base', 'modelBase', '기종']),
    fySheet: textValue(row, ['fy_sheet', 'fiscal_year', 'fiscalYear', '회계연도']),
    biz: textValue(row, ['biz', '사업']),
    rows: numberValue(row, ['n_rows', 'rows']),
    firstYm: textValue(row, ['first_ym', 'firstYm']),
    lastYm: textValue(row, ['last_ym', 'lastYm']),
    totalAct: numberValue(row, ['total_act', 'totalAct']),
    scoredSales: numberValue(row, ['n_scored_sales', 'scoredSales']),
    salesWape: numberValue(row, ['sales_wape', 'salesWape']),
    salesBias: numberValue(row, ['sales_bias', 'salesBias']),
    scoredScm: numberValue(row, ['n_scored_scm', 'scoredScm']),
    scmWape: numberValue(row, ['scm_wape', 'scmWape']),
    scmBias: numberValue(row, ['scm_bias', 'scmBias']),
    scored: numberValue(row, ['n_scored', 'scored']),
    source,
    reasonCode: textValue(row, ['reason_code', 'reasonCode', '사유코드']),
  };
}

export function normalizeBomRequirement(row: Record<string, unknown>): BomRequirement {
  return {
    modelBase: textValue(row, ['model_base', 'modelBase', '기종']),
    modelKey: textValue(row, ['model_key', 'modelKey']),
    partRole: textValue(row, ['part_role', 'partRole', '부품역할']),
    itemCode: textValue(row, ['item_code', 'itemCode', '품목코드']),
    description: textValue(row, ['description', 'item_name', 'itemName', '품목명']),
    quantity: numberValue(row, ['qty', 'quantity', 'required_qty', '수량']),
    bomGroup: textValue(row, ['bom_group', 'bomGroup']),
    nModels: numberValue(row, ['n_models', 'nModels']),
    commonFlag: textValue(row, ['common_flag', 'commonFlag', '공용구분']),
    commonNote: textValue(row, ['common_note', 'commonNote']),
  };
}
