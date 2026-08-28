import PageHeader from '@/components/shell/page-header';
import KpiCard from '@/components/ui/kpi-card';
import Panel from '@/components/ui/panel';
import DataTable, { formatNumber, type Column } from '@/components/ui/data-table';
import EmptyValue from '@/components/ui/empty-value';
import Badge from '@/components/ui/badge';
import { getStockoutKpi, getStockoutRisks } from '@/lib/scm';
import type { StockoutRisk, StockoutRiskStatus } from '@/lib/scm-model';

export const dynamic = 'force-dynamic';
function statusTone(status: StockoutRiskStatus) { return status === 'CRITICAL' ? 'critical' : status === 'SAFE' ? 'safe' : 'calculation-unavailable'; }
function statusLabel(status: StockoutRiskStatus) { return status === 'CRITICAL' ? '위험' : status === 'SAFE' ? '안전' : '계산 불가'; }
function formatDate(value: string | null) { if (!value) return <EmptyValue reasonCode="STOCKOUT_DATE_UNAVAILABLE" />; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR'); }
const columns: Column<StockoutRisk>[] = [
  { key: 'itemId', label: '품목코드' }, { key: 'itemName', label: '품목명' }, { key: 'supplierId', label: '공급처' },
  { key: 'availableQty', label: '가용재고', align: 'right', render: (row) => formatNumber(row.availableQty, ' EA', 'AVAILABLE_QTY_UNAVAILABLE') },
  { key: 'dailyUsageAverage', label: '일평균 사용량', align: 'right', render: (row) => formatNumber(row.dailyUsageAverage, ' EA', 'NO_USAGE') },
  { key: 'plannedLeadTime', label: '계획 리드타임', align: 'right', render: (row) => formatNumber(row.plannedLeadTime, '일', 'NO_LEADTIME') },
  { key: 'stockoutDays', label: '소진 예상', align: 'right', render: (row) => formatNumber(row.stockoutDays, '일', row.reason) },
  { key: 'stockoutDate', label: '소진 예정일', align: 'right', render: (row) => formatDate(row.stockoutDate) },
  { key: 'riskStatus', label: '위험도', align: 'center', render: (row) => <Badge tone={statusTone(row.riskStatus)}>{statusLabel(row.riskStatus)}</Badge> },
];
export default async function StockoutPage() {
  const [{ rows, error: risksError }, { data: kpi, error: kpiError }] = await Promise.all([getStockoutRisks(), getStockoutKpi()]);
  const error = risksError ?? kpiError;
  return <div className="content"><PageHeader title="재고 소진 위험" description="가용재고와 일평균 사용량을 기준으로 품목별 소진 위험을 확인합니다." />
    {error ? <Panel><p className="text-critical">조회에 실패했습니다.</p><p className="muted">{error}</p></Panel> : <>
      <div className="grid grid-4"><KpiCard label="전체 품목" value={kpi?.items ?? rows.length} foot="활성 품목" /><KpiCard label="소진 위험" value={kpi?.critical ?? rows.filter((row) => row.riskStatus === 'CRITICAL').length} foot="계획 리드타임 이전 소진" status="critical" /><KpiCard label="30일 이내" value={kpi?.within30Days ?? 0} foot="소진 예상 품목" status="warning" /><KpiCard label="판정 불가" value={kpi?.unknown ?? rows.filter((row) => row.riskStatus === 'UNKNOWN').length} foot="사용량 또는 리드타임 부족" status="warning" /></div>
      <Panel title="품목별 소진 위험" meta="가용재고 ÷ 일평균 사용량"><DataTable columns={columns} rows={[...rows].sort((a, b) => ({ CRITICAL: 0, UNKNOWN: 1, SAFE: 2 }[a.riskStatus] - ({ CRITICAL: 0, UNKNOWN: 1, SAFE: 2 }[b.riskStatus])))} rowKey={(row) => row.itemId} empty="데이터가 없습니다. analytics.v_stockout_risk를 확인하세요." /></Panel>
    </>}
  </div>;
}
