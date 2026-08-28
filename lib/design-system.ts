export type SystemStatus = 'SAFE' | 'WARNING' | 'CRITICAL' | 'CALCULATION_UNAVAILABLE';
export type StatusTone = 'safe' | 'warning' | 'critical' | 'calculation-unavailable';

export function getStatusTone(status: SystemStatus): StatusTone {
  return status.toLowerCase().replace('_', '-') as StatusTone;
}

export function formatEmptyValue(reasonCode?: string | null) {
  return reasonCode ? `— + ${reasonCode}` : '—';
}
