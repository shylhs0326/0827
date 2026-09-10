import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';
export const dynamic = 'force-dynamic';
export default function ForecastModelsPage() { return <div className="content"><PageHeader title="Forecast Models" description="예측 모델 설정과 상태를 관리합니다." /><Panel title="준비 중"><p className="muted">STEP 6 마이그레이션 적용 후 연결됩니다.</p></Panel></div>; }
