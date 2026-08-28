import type { ReactNode } from 'react';

export default function KpiCard({ label, value, foot, status, action }: { label: string; value: ReactNode; foot?: ReactNode; status?: 'safe' | 'warning' | 'critical'; action?: ReactNode }) {
  return <section className={`card kpi-card ${status ? `status-${status}` : ''}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{foot && <div className={`metric-foot ${status ?? ''}`}>{foot}</div>}{action}</section>;
}
