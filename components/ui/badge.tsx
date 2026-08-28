import type { ReactNode } from 'react';

export type BadgeTone = 'safe' | 'warning' | 'critical' | 'calculation-unavailable' | 'blue' | 'gray';
export default function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
