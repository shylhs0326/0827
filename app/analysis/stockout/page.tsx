import AnalysisFrame from '@/components/analysis/analysis-frame';
import DataTable, { formatNumber, type Column } from '@/components/analysis/data-table';
import { getStockoutKpi, getStockoutRisks } from '@/lib/scm';
import type { StockoutRisk, StockoutRiskStatus } from '@/lib/scm-model';

export const dynamic = 'force-dynamic';

function RiskBadge({ status }: { status: StockoutRiskStatus }) {
  const tone = status === 'CRITICAL' ? 'amber' : status === 'SAFE' ? 'green' : 'gray';
  const label = status === 'CRITICAL' ? '위험' : status === 'SAFE' ? '안전' : '판정불가';
  return <span className={`tag ${tone}`}>{label}</span>;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR');
}

const columns: Column<StockoutRisk>[] = [
  { key: 'itemId', label: '품목코드' },
  { key: 'itemName', label: '품목명' },
  { key: 'supplierId', label: '공급처' },
  { key: 'availableQty', label: '가용재고', align: 'right', render: (row) => formatNumber(row.availableQty, ' EA') },
  { key: 'dailyUsageAverage', label: '일평균 사용량', align: 'right', render: (row) => formatNumber(row.dailyUsageAverage, ' EA') },
  { key: 'plannedLeadTime', label: '계획 리드타임', align: 'right', render: (row) => formatNumber(row.plannedLeadTime, '일') },
  { key: 'stockoutDays', label: '소진 예상', align: 'right', render: (row) => formatNumber(row.stockoutDays, '일') },
  { key: 'stockoutDate', label: '소진 예정일', align: 'right', render: (row) => formatDate(row.stockoutDate) },
  { key: 'riskStatus', label: '위험도', align: 'center', render: (row) => <RiskBadge status={row.riskStatus} /> },
];

export default async function StockoutPage() {
  const [{ rows, error: risksError }, { data: kpi, error: kpiError }] = await Promise.all([
    getStockoutRisks(),
    getStockoutKpi(),
  ]);

  const error = risksError ?? kpiError;
  if (error) {
    return (
      <AnalysisFrame
        title="재고 소진 위험"
        description="가용재고와 일평균 사용량을 기준으로 품목별 소진 위험을 확인합니다."
      >
        <div className="card">
          <p className="text-danger">조회에 실패했습니다.</p>
          <p className="muted">{error}</p>
        </div>
      </AnalysisFrame>
    );
  }

  const sortedRows = [...rows].sort((a, b) => {
    const priority = { CRITICAL: 0, UNKNOWN: 1, SAFE: 2 };
    return priority[a.riskStatus] - priority[b.riskStatus];
  });

  return (
    <AnalysisFrame
      title="재고 소진 위험"
      description="가용재고와 일평균 사용량을 기준으로 품목별 소진 위험을 확인합니다."
    >
      <div className="grid grid-4">
        <div className="card metric">
          <div className="metric-label">전체 품목</div>
          <div className="metric-value">{kpi?.items ?? rows.length}</div>
          <div className="metric-foot">활성 품목</div>
        </div>
        <div className="card metric">
          <div className="metric-label">소진 위험</div>
          <div className="metric-value">{kpi?.critical ?? 0}</div>
          <div className="metric-foot warn">계획 리드타임 이전 소진</div>
        </div>
        <div className="card metric">
          <div className="metric-label">30일 이내</div>
          <div className="metric-value">{kpi?.within30Days ?? 0}</div>
          <div className="metric-foot">소진 예상 품목</div>
        </div>
        <div className="card metric">
          <div className="metric-label">판정 불가</div>
          <div className="metric-value">{kpi?.unknown ?? 0}</div>
          <div className="metric-foot">사용량 또는 리드타임 부족</div>
        </div>
      </div>

      <div className="section card">
        <div className="card-title">
          <h3>품목별 소진 위험</h3>
          <span>가용재고 ÷ 일평균 사용량</span>
        </div>
        <DataTable
          columns={columns}
          rows={sortedRows}
          rowKey={(row) => row.itemId}
          empty="데이터가 없습니다. Exposed schemas 와 analytics.v_stockout_risk 를 확인하세요."
        />
      </div>
    </AnalysisFrame>
  );
}
