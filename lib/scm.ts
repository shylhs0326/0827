import { createSupabaseServerClient } from './supabase';
import {
  normalizeLeadtimeGap,
  normalizeBomRequirement,
  normalizeDemandProfile,
  normalizeItemDemandKpi,
  normalizeItemDemandProfile,
  normalizeOlAccuracy,
  normalizeOlAccuracyFy,
  normalizeShipmentTrend,
  normalizeStockoutKpi,
  normalizeStockoutRisk,
  type BomRequirement,
  type DemandProfile,
  type ItemDemandKpi,
  type ItemDemandProfile,
  type OlAccuracy,
  type OlAccuracyFy,
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
    let monthlyQuery = supabase.schema('core').from('v_shipment_by_hoc').select('*');
    if (itemCode) {
      query = query.eq('item_code', itemCode);
      monthlyQuery = monthlyQuery.eq('hoc_item', itemCode);
    }
    const [{ data, error }, { data: monthlyData, error: monthlyError }] = await Promise.all([query, monthlyQuery]);
    if (error) return { rows: [], error: error.message };
    if (monthlyError) return { rows: [], error: monthlyError.message };

    const monthlyByItem = new Map<string, Array<{ ym: string; qty: number | null }>>();
    for (const raw of monthlyData ?? []) {
      const row = raw as Record<string, unknown>;
      const key = String(row.hoc_item ?? row.item_code ?? '');
      const months = monthlyByItem.get(key) ?? [];
      const quantity = row.qty === null || row.qty === undefined ? null : Number(row.qty);
      months.push({ ym: String(row.ym ?? ''), qty: Number.isFinite(quantity) ? quantity : null });
      monthlyByItem.set(key, months);
    }
    return {
      rows: (data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return normalizeShipmentTrend({
          ...row,
          monthly: (monthlyByItem.get(String(row.item_code ?? '')) ?? []).map((month) => ({ ym: month.ym, qty: month.qty })),
        });
      }),
      error: null,
    };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export async function getDemandProfile(itemCode?: string): Promise<{ rows: DemandProfile[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.schema('analytics').from('v_sku_demand_profile').select('*');
    if (itemCode) query = query.eq('item_code', itemCode);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeDemandProfile(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Supabase 조회에 실패했습니다.' };
  }
}

export const getDemandProfileRt = getDemandProfile;

export async function getItemDemandProfiles(): Promise<{ rows: ItemDemandProfile[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_item_demand_profile').select('*').order('item_code');
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeItemDemandProfile(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : '수요 프로파일을 조회하지 못했습니다.' };
  }
}

export async function getItemDemandKpi(): Promise<{ rows: ItemDemandKpi[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_item_demand_kpi').select('*').order('item_type');
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeItemDemandKpi(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : '수요 KPI를 조회하지 못했습니다.' };
  }
}

export async function getOlAccuracy(modelBase?: string, fy?: string): Promise<{ rows: OlAccuracy[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let modelQuery = supabase.schema('analytics').from('v_ol_accuracy').select('*');
    let fiscalYearQuery = supabase.schema('analytics').from('v_ol_accuracy_fy').select('*');
    if (modelBase) {
      modelQuery = modelQuery.eq('model_base', modelBase);
    }
    if (fy) {
      modelQuery = modelQuery.eq('fy_sheet', fy);
      fiscalYearQuery = fiscalYearQuery.eq('fy_sheet', fy);
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

export async function getOlAccuracyFy(): Promise<{ rows: OlAccuracyFy[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema('analytics').from('v_ol_accuracy_fy').select('*').order('fy_sheet');
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => normalizeOlAccuracyFy(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'OL 정확도 요약을 조회하지 못했습니다.' };
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
