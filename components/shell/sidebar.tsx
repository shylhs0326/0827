'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Boxes, Gauge, Settings2, Workflow } from 'lucide-react';
import { menu, type MenuItem } from '@/lib/menu';

const icons = { '/workflow': Gauge, '/analysis/leadtime': Workflow, '/analysis/stockout': Boxes, '/admin': Settings2, '/admin/master': Settings2 };

export default function Sidebar({ items = menu.user }: { items?: MenuItem[] }) {
  const pathname = usePathname();
  return <aside className="sidebar system-sidebar">
    <Link href="/" className="brand"><span className="brand-mark">OP</span><span className="brand-copy"><strong>월간 발주계획</strong><span>Procurement Planning</span></span></Link>
    <div className="nav-label">NAVIGATION</div>
    <nav className="nav-list" aria-label="주요 메뉴">
      {items.map((item) => { const Icon = icons[item.href as keyof typeof icons] ?? BarChart3; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={`nav-button nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><span className="nav-number"><Icon size={14} /></span><span>{item.label}</span></Link>; })}
    </nav>
    <div className="sidebar-foot"><b>2026년 09월 발주계획</b><br />SCM control center · Phase 1</div>
  </aside>;
}
