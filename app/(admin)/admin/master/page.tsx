import PageHeader from '@/components/shell/page-header';
import Panel from '@/components/ui/panel';

export default function MasterPage() { return <div className="content"><PageHeader title="마스터 관리" description="품목·공급처·구매조건 기준 데이터를 관리합니다." /><Panel title="준비 중"><p className="muted">마스터 관리 기능은 다음 단계에서 연결됩니다.</p></Panel></div>; }
