import type { ReactNode } from 'react';
import Sidebar from '@/components/shell/sidebar';
import Topbar from '@/components/shell/topbar';
import { adminMenu } from '@/lib/menu';

export default function AdminLayout({ children }: { children: ReactNode }) { return <div className="app-shell"><Sidebar items={adminMenu} /><main className="main"><Topbar title="관리자" eyebrow="SYSTEM ADMINISTRATION" />{children}</main></div>; }
