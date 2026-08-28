import LogoutButton from '@/components/auth/logout-button';

export default function Topbar({ title = 'SCM Control Center', eyebrow = 'MONTHLY PROCUREMENT CONTROL' }: { title?: string; eyebrow?: string }) {
  return <header className="topbar system-topbar"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div><div className="top-meta"><span className="local-badge">SUPABASE LIVE</span><span>기준월도 <b>2026.09</b></span><LogoutButton /></div></header>;
}
