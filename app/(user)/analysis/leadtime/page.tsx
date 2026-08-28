import PageHeader from '@/components/shell/page-header';
import KpiCard from '@/components/ui/kpi-card';
import Panel from '@/components/ui/panel';
import DataTable, { formatNumber, type Column } from '@/components/ui/data-table';
import EmptyValue from '@/components/ui/empty-value';
import Badge from '@/components/ui/badge';
import { getLeadtimeGap } from '@/lib/scm';
import type { LeadtimeGap } from '@/lib/scm-model';

export const dynamic = 'force-dynamic';

const columns: Column<LeadtimeGap>[] = [
  { key: 'supplier', label: '공급처' }, { key: 'country', label: '국가' },
  { key: 'masterLeadTime', label: '마스터', align: 'right', render: (row) => formatNumber(row.masterLeadTime, '일', 'MASTER_LT_UNAVAILABLE') },
  { key: 'sampleCount', label: '표본수', align: 'right', render: (row) => row.sampleCount.toLocaleString() },
  { key: 'actualAverage', label: '실적평균', align: 'right', render: (row) => formatNumber(row.actualAverage, '일', 'ACTUAL_AVERAGE_UNAVAILABLE') },
  { key: 'p80', label: 'P80', align: 'right', render: (row) => formatNumber(row.p80, '일', 'P80_UNAVAILABLE') },
  { key: 'gap', label: '격차', align: 'right', render: (row) => row.gap === null ? <EmptyValue reasonCode="GAP_UNAVAILABLE" /> : <Badge tone={row.gap > 0 ? 'critical' : 'safe'}>{row.gap > 0 ? '+' : ''}{formatNumber(row.gap, '일')}</Badge> },
];

export default async function LeadtimePage() {
  const { rows, error } = await getLeadtimeGap();
  return <div className="content"><PageHeader title="리드타임 격차" description="마스터 리드타임과 실제 실적 P80을 비교해 계획이 현실보다 짧게 잡힌 공급처를 찾습니다." />
    {error ? <Panel><p className="text-critical">조회에 실패했습니다.</p><p className="muted">{error}</p></Panel> : <>
      <div className="grid grid-3"><KpiCard label="공급처" value={rows.length} foot="사용 중인 생산법인" /><KpiCard label="실제가 더 김" value={rows.filter((row) => row.gap !== null && row.gap > 0).length} foot="격차 > 0인 공급처" status="warning" /><KpiCard label="표본 부족" value={rows.filter((row) => row.sampleCount < 10).length} foot="표본 10건 미만" status="warning" /></div>
      <Panel title="공급처별 리드타임" meta="격차 = P80 − 마스터"><DataTable columns={columns} rows={rows} rowKey={(row, index) => `${row.supplier}-${index}`} empty="데이터가 없습니다. analytics.v_leadtime_gap을 확인하세요." /></Panel>
    </>}
  </div>;
}
