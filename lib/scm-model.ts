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

export type ShipmentTrend = {
  itemCode: string;
  months: number | null;
  average3Months: number | null;
  average6Months: number | null;
  average12Months: number | null;
};

export type DemandProfile = {
  itemCode: string;
  itemName: string | null;
  adi: number | null;
  cvSquared: number | null;
  noDemandRate: number | null;
  demandType: string | null;
  reasonCode: string | null;
};

export type OlAccuracy = {
  modelBase: string | null;
  fiscalYear: string | null;
  salesWape: number | null;
  salesBias: number | null;
  scmWape: number | null;
  scmBias: number | null;
  source: 'MODEL' | 'FY_TOTAL';
};

export type BomRequirement = {
  modelBase: string | null;
  itemCode: string | null;
  hocCode: string | null;
  description: string | null;
  partRole: string | null;
  quantity: number | null;
  commonFlag: string | null;
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
    months: numberValue(row, ['n_months', 'months', 'month_count', '개월수']),
    average3Months: numberValue(row, ['avg_3m', 'average_3_months', 'average3Months', '3개월평균']),
    average6Months: numberValue(row, ['avg_6m', 'average_6_months', 'average6Months', '6개월평균']),
    average12Months: numberValue(row, ['avg_12m', 'average_12_months', 'average12Months', '12개월평균']),
  };
}

export function normalizeDemandProfile(row: Record<string, unknown>): DemandProfile {
  return {
    itemCode: textValue(row, ['item_code', 'itemCode', '품목코드']) ?? '미정',
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
    fiscalYear: textValue(row, ['fiscal_year', 'fiscalYear', '회계연도']),
    salesWape: numberValue(row, ['sales_wape', 'salesWape']),
    salesBias: numberValue(row, ['sales_bias', 'salesBias']),
    scmWape: numberValue(row, ['scm_wape', 'scmWape']),
    scmBias: numberValue(row, ['scm_bias', 'scmBias']),
    source,
  };
}

export function normalizeBomRequirement(row: Record<string, unknown>): BomRequirement {
  return {
    modelBase: textValue(row, ['model_base', 'modelBase', '기종']),
    itemCode: textValue(row, ['item_code', 'itemCode', '품목코드']),
    hocCode: textValue(row, ['hoc_code', 'hocCode', '대표코드']),
    description: textValue(row, ['description', 'item_name', 'itemName', '품목명']),
    partRole: textValue(row, ['part_role', 'partRole', '부품역할']),
    quantity: numberValue(row, ['qty', 'quantity', 'required_qty', '수량']),
    commonFlag: textValue(row, ['common_flag', 'commonFlag', '공용구분']),
  };
}
