import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItemDemandKpi, normalizeItemDemandProfile, normalizeLeadtimeGap, normalizeOlAccuracyFy, normalizeShipmentTrend } from './scm-model.ts';

test('normalizes analytics leadtime rows into the screen model', () => {
  const result = normalizeLeadtimeGap({
    supplier_name: 'Fujifilm BI India',
    country: 'India',
    master_lt: 32,
    sample_count: 159,
    actual_avg: 37.6,
    p80: 44,
    gap: 12,
  });

  assert.deepEqual(result, {
    supplier: 'Fujifilm BI India',
    country: 'India',
    masterLeadTime: 32,
    sampleCount: 159,
    actualAverage: 37.6,
    p80: 44,
    gap: 12,
  });
});

test('normalizes the shipment trend sample used by the live query', () => {
  assert.deepEqual(normalizeShipmentTrend({
    item_code: '602K02693',
    n_span: 40,
    avg_3m: 779.0,
    avg_12m: 772.3,
  }), {
    itemCode: '602K02693',
    description: null,
    family: null,
    itemType: null,
    dataAsOf: null,
    firstYm: null,
    lastYm: null,
    monthsSinceLast: null,
    span: 40,
    totalQty: null,
    latestQty: null,
    monthly: [],
    average3Months: 779.0,
    average6Months: null,
    average12Months: 772.3,
    trend3mVs12m: null,
    reasonCode: null,
  });
});

test('uses Korean view aliases and safe defaults', () => {
  const result = normalizeLeadtimeGap({ 법인: 'Japan', 국가: 'Japan', 표준리드타임: 7, 표본수: 278, 실적평균: 14.5, P80: 18, 격차: 11 });
  assert.equal(result.supplier, 'Japan');
  assert.equal(result.masterLeadTime, 7);
  assert.equal(result.p80, 18);
  assert.equal(result.gap, 11);
});

test('reads the real analytics.v_leadtime_gap column names', () => {
  const result = normalizeLeadtimeGap({
    supplier_name: 'Fujifilm BI China',
    country: 'China',
    std_lead_time: 25,
    n_samples: 210,
    mean_days: 28.4,
    p80_days: 33,
    gap_days: 8,
  });

  assert.deepEqual(result, {
    supplier: 'Fujifilm BI China',
    country: 'China',
    masterLeadTime: 25,
    sampleCount: 210,
    actualAverage: 28.4,
    p80: 33,
    gap: 8,
  });
});

test('normalizes the real-data demand profile and keeps insufficient history null', () => {
  assert.deepEqual(normalizeItemDemandProfile({
    item_code: '602K02693', description: '필터', n_periods: 5, n_nonzero: 2,
    adi: 2.5, zero_demand_rate: 0.6, cv_squared: 1.2,
    demand_type: null, reason_code: 'INSUFFICIENT_HISTORY',
  }), {
    itemCode: '602K02693', description: '필터', family: null, itemType: null,
    dataAsOf: null, firstYm: null, lastYm: null, nPeriods: 5, nNonzero: 2,
    meanNonzeroQty: null, adi: 2.5, zeroDemandRate: 0.6, cvSquared: 1.2,
    demandType: null, reasonCode: 'INSUFFICIENT_HISTORY',
  });
});

test('normalizes demand KPI and fiscal-year accuracy rows', () => {
  assert.equal(normalizeItemDemandKpi({ item_type: 'PART', n_items: 10, n_unknown: 2 }).nUnknown, 2);
  assert.deepEqual(normalizeOlAccuracyFy({ fy_sheet: 'FY26', n_rows: 12, n_scored: 10, sales_wape: 0.2 }), {
    fySheet: 'FY26', rows: 12, scored: 10, salesWape: 0.2,
    scmWape: null, salesBias: null, scmBias: null,
  });
});
