import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';
export const dynamic = 'force-dynamic';
export default function AdminSettingsPage() { return <div className="content"><PageHeader title="시스템 설정" description="운영 환경과 기준 설정을 관리합니다." /><Panel title="준비 중"><p className="muted">설정 항목은 운영 정책 확정 후 연결됩니다.</p></Panel></div>; }
