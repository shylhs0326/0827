import AnalysisFrame from '@/components/analysis/analysis-frame';
import OlAccuracyTable from '@/components/analysis/ol-accuracy-table';
import DataTable, { type Column } from '@/components/ui/data-table';
import { getOlAccuracy, getOlAccuracyFy } from '@/lib/scm';
import type { OlAccuracyFy } from '@/lib/scm-model';

export const dynamic = 'force-dynamic';

function percent(value: number | null) { return value === null ? '—' : `${(value * 100).toFixed(1)}%`; }
const columns: Column<OlAccuracyFy>[] = [
  { key: 'fySheet', label: '회계연도' }, { key: 'scored', label: '채점 행수', align: 'right' },
  { key: 'salesWape', label: '영업 WAPE', align: 'right', render: (row) => percent(row.salesWape) },
  { key: 'scmWape', label: 'SCM WAPE', align: 'right', render: (row) => percent(row.scmWape) },
  { key: 'salesBias', label: '영업 Bias', align: 'right', render: (row) => percent(row.salesBias) },
  { key: 'scmBias', label: 'SCM Bias', align: 'right', render: (row) => percent(row.scmBias) },
];

export default async function ModelComparisonPage() {
  const [{ rows, error }, { rows: fyRows, error: fyError }] = await Promise.all([getOlAccuracy(), getOlAccuracyFy()]);
  const failure = error ?? fyError;
  if (failure) return <AnalysisFrame title="OL 예측 정확도" description="영업 OL과 SCM OL을 실적과 비교합니다."><div className="card"><p className="text-danger">조회에 실패했습니다.</p><p className="muted">{failure}</p></div></AnalysisFrame>;
  return <AnalysisFrame title="OL 예측 정확도" description="영업 OL과 SCM OL이 실적을 얼마나 맞혔는지 비교합니다. Bias 양수는 과대예측입니다.">
    <section className="section card"><div className="card-title"><div><h3>회계연도 전체</h3><span>실적이 있는 행만 채점했습니다.</span></div></div><DataTable columns={columns} rows={fyRows} rowKey={(row) => row.fySheet} empty="채점할 실적이 없습니다." /></section>
    <OlAccuracyTable rows={rows} />
  </AnalysisFrame>;
}
