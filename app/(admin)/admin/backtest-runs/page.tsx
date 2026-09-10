import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';
export const dynamic = 'force-dynamic';
export default function BacktestRunsPage() { return <div className="content"><PageHeader title="Backtest Runs" description="예측 검증 실행 이력을 확인합니다." /><Panel title="준비 중"><p className="muted">STEP 7 마이그레이션 적용 후 연결됩니다.</p></Panel></div>; }
