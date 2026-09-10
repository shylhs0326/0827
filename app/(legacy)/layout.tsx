import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LegacyLayout({ children }: { children: ReactNode }) { await requireUser(); return children; }
