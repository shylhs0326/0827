import type { ReactNode } from 'react';

export default function InsightBanner({ tone = 'blue', title, children }: { tone?: 'blue' | 'warning' | 'critical'; title: string; children: ReactNode }) { return <aside className={`insight-banner insight-${tone}`}><strong>{title}</strong><span>{children}</span></aside>; }
