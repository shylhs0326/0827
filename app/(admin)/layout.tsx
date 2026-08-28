import type { ReactNode } from 'react';
import Sidebar from '@/components/shell/sidebar';
import Topbar from '@/components/shell/topbar';
import { adminMenu } from '@/lib/menu';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) { await requireAdmin(); return <div className="app-shell"><Sidebar items={adminMenu} /><main className="main"><Topbar title="관리자" eyebrow="SYSTEM ADMINISTRATION" />{children}</main></div>; }
