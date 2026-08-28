import type { ReactNode } from 'react';

export default function PageHeader({ title, description, eyebrow = 'ANALYSIS', action }: { title: string; description: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}
