import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';

export const dynamic = 'force-dynamic';
export default function DemandAdminPage() { return <div className="content"><PageHeader title="수요 관리" description="수요 데이터의 기준과 상태를 확인합니다." /><Panel title="준비 중"><p className="muted">실데이터 연결 후 제공됩니다.</p></Panel></div>; }
