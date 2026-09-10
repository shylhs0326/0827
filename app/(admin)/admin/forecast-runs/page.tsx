import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';
export const dynamic = 'force-dynamic';
export default function ForecastRunsPage() { return <div className="content"><PageHeader title="Forecast Runs" description="예측 실행 이력을 확인합니다." /><Panel title="준비 중"><p className="muted">실행 이력 테이블 연결 후 제공됩니다.</p></Panel></div>; }
