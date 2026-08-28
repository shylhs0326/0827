import type { ReactNode } from 'react';
import Badge, { type BadgeTone } from './badge';

export default function AlertRow({ tone, label, children }: { tone: BadgeTone; label: string; children: ReactNode }) { return <div className={`alert-row alert-${tone}`}><Badge tone={tone}>{label}</Badge><span>{children}</span></div>; }
