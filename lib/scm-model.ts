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
