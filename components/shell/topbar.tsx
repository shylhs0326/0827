import LogoutButton from '@/components/auth/logout-button';
import type { AppRole } from '@/lib/menu';

export default function Topbar({ title = 'SCM Control Center', eyebrow = 'MONTHLY PROCUREMENT CONTROL', name, role }: { title?: string; eyebrow?: string; name?: string; role?: AppRole }) {
  return <header className="topbar system-topbar"><div><div className="eyebrow">{role ? 'SCM INTELLIGENCE' : eyebrow}</div><h1>{role ? '공급망 운영 콘솔' : title}</h1></div><div className="top-meta"><span className="local-badge">{role ?? 'SUPABASE LIVE'}</span><span>기준월 <b>2026.09</b></span>{name ? <span>{name}</span> : null}<LogoutButton /></div></header>;
}
