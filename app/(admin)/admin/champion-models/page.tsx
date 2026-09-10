import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';
export const dynamic = 'force-dynamic';
export default function ChampionModelsPage() { return <div className="content"><PageHeader title="Champion Models" description="대표 예측 모델을 확인합니다." /><Panel title="준비 중"><p className="muted">검증 기준과 모델 데이터 연결 후 제공됩니다.</p></Panel></div>; }
