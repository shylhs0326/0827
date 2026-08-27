import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStockoutKpi, normalizeStockoutRisk } from './scm-model.ts';

test('normalizes stockout risk rows from analytics view', () => {
  const result = normalizeStockoutRisk({
    item_id: 'ITEM001',
    item_name: '토너 카트리지',
    supplier_id: 'SUP001',
    current_stock: 120,
    inbound_qty: 30,
    available_qty: 150,
    daily_usage_avg: 5,
    cv: 0.4,
    planned_lead_time: 25,
    stockout_days: 30,
    stockout_date: '2026-09-26',
    risk_status: 'CRITICAL',
    reason: null,
  });

  assert.deepEqual(result, {
    itemId: 'ITEM001',
    itemName: '토너 카트리지',
    supplierId: 'SUP001',
    currentStock: 120,
    inboundQty: 30,
    availableQty: 150,
    dailyUsageAverage: 5,
    cv: 0.4,
    plannedLeadTime: 25,
    stockoutDays: 30,
    stockoutDate: '2026-09-26',
    riskStatus: 'CRITICAL',
    reason: null,
  });
});

test('preserves unknown reason when usage or leadtime is unavailable', () => {
  const result = normalizeStockoutRisk({
    item_id: 'ITEM020',
    item_name: '특수 부품',
    supplier_id: 'SUP013',
    current_stock: 10,
    inbound_qty: 0,
    available_qty: 10,
    daily_usage_avg: null,
    planned_lead_time: null,
    stockout_days: null,
    stockout_date: null,
    risk_status: 'UNKNOWN',
    reason: 'NO_USAGE',
  });

  assert.equal(result.riskStatus, 'UNKNOWN');
  assert.equal(result.stockoutDays, null);
  assert.equal(result.reason, 'NO_USAGE');
});

test('normalizes stockout KPI values', () => {
  assert.deepEqual(normalizeStockoutKpi({
    n_items: 20,
    n_critical: 4,
    n_safe: 12,
    n_unknown: 4,
    n_within_30d: 5,
    avg_stockout_days: 48.2,
  }), {
    items: 20,
    critical: 4,
    safe: 12,
    unknown: 4,
    within30Days: 5,
    averageStockoutDays: 48.2,
  });
});
