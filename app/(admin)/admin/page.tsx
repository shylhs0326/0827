import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';

export default function AdminPage() { return <div className="content"><PageHeader title="관리자 홈" description="기준 데이터와 시스템 설정을 관리합니다." /><Panel title="관리 메뉴"><p className="muted">관리 기능을 선택하세요.</p></Panel></div>; }
