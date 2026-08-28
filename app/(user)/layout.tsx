import type { ReactNode } from 'react';
import Sidebar from '@/components/shell/sidebar';
import Topbar from '@/components/shell/topbar';
import { requireUser } from '@/lib/auth';

export default async function UserLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <div className="app-shell"><Sidebar /><main className="main"><Topbar />{children}</main></div>;
}
