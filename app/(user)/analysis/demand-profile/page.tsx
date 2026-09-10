import AnalysisFrame from '@/components/analysis/analysis-frame';
import DemandProfileTable from '@/components/analysis/demand-profile-table';
import KpiCard from '@/components/ui/kpi-card';
import { getItemDemandKpi, getItemDemandProfiles } from '@/lib/scm';

export const dynamic = 'force-dynamic';

export default async function DemandProfilePage() {
  const [{ rows, error }, { rows: kpiRows, error: kpiError }] = await Promise.all([getItemDemandProfiles(), getItemDemandKpi()]);
  const failure = error ?? kpiError;
  if (failure) return <AnalysisFrame title="수요 패턴" description="출고 실적으로 품목의 수요 성격을 분류합니다."><div className="card"><p className="text-danger">조회에 실패했습니다.</p><p className="muted">{failure}</p></div></AnalysisFrame>;
  const unknown = kpiRows.reduce((sum, row) => sum + row.nUnknown, 0);
  return <AnalysisFrame title="수요 패턴" description="출고 실적으로 품목의 수요 성격을 분류합니다. 관측 6개월 미만은 유형을 추정하지 않습니다.">
    <div className="grid grid-3"><KpiCard label="분석 품목" value={rows.length.toLocaleString('ko-KR')} foot="출고 실적 기반" /><KpiCard label="유형 판정 불가" value={unknown.toLocaleString('ko-KR')} foot="관측 기간 부족" status="warning" /><KpiCard label="데이터 기준월" value={rows.find((row) => row.dataAsOf)?.dataAsOf ?? '—'} foot="출고 실적 최종월" status="safe" /></div>
    <DemandProfileTable rows={rows} />
  </AnalysisFrame>;
}
