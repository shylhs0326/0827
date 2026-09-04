import { createSupabaseServerClient } from './supabase';
import {
  normalizeLeadtimeGap,
  normalizeBomRequirement,
  normalizeDemandProfile,
  normalizeOlAccuracy,
  normalizeShipmentTrend,
  normalizeStockoutKpi,
  normalizeStockoutRisk,
  type BomRequirement,
  type DemandProfile,
  type OlAccuracy,
  type ShipmentTrend,
  type LeadtimeGap,
  type StockoutRisk,
} from './scm-model';

export async function getLeadtimeGap(): Promise<{ rows: LeadtimeGap[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_leadtime_gap').select('*');
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeLeadtimeGap(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getStockoutKpi() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_stockout_kpi').select('*').maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data: data ? normalizeStockoutKpi(data as Record<string, unknown>) : null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getStockoutRisks(): Promise<{ rows: StockoutRisk[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_stockout_risk').select('*');
    if (error) return { rows: [], error: error.message };
    return {
      rows: (data ?? []).map((row) => normalizeStockoutRisk(row as Record<string, unknown>)),
      error: null,
    };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getShipmentTrend(itemCode?: string): Promise<{ rows: ShipmentTrend[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.schema('analytics').from('v_shipment_trend').select('*');
    if (itemCode) query = query.eq('item_code', itemCode);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeShipmentTrend(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getDemandProfileRt(itemCode?: string): Promise<{ rows: DemandProfile[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.schema('analytics').from('v_item_demand_profile').select('*');
    if (itemCode) query = query.eq('item_code', itemCode);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeDemandProfile(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getOlAccuracy(modelBase?: string): Promise<{ rows: OlAccuracy[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let modelQuery = supabase.schema('analytics').from('v_ol_accuracy').select('*');
    let fiscalYearQuery = supabase.schema('analytics').from('v_ol_accuracy_fy').select('*');
    if (modelBase) {
      modelQuery = modelQuery.eq('model_base', modelBase);
      fiscalYearQuery = fiscalYearQuery.eq('model_base', modelBase);
    }
    const [{ data: modelData, error: modelError }, { data: fiscalYearData, error: fiscalYearError }] = await Promise.all([
      modelQuery,
      fiscalYearQuery,
    ]);
    if (modelError) return { rows: [], error: modelError.message };
    if (fiscalYearError) return { rows: [], error: fiscalYearError.message };
    return {
      rows: [
        ...(modelData ?? []).map((row) => normalizeOlAccuracy(row as Record<string, unknown>)),
        ...(fiscalYearData ?? []).map((row) => normalizeOlAccuracy(row as Record<string, unknown>, 'FY_TOTAL')),
      ],
      error: null,
    };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getBomRequirement(modelBase: string): Promise<{ rows: BomRequirement[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema('analytics')
      .from('v_bom_requirement_x')
      .select('*')
      .eq('model_base', modelBase);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeBomRequirement(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}
