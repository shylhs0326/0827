import { formatEmptyValue } from '@/lib/design-system';

export default function EmptyValue({ reasonCode }: { reasonCode?: string | null }) { return <span className="empty-value" title={reasonCode ?? undefined}>{formatEmptyValue(reasonCode)}</span>; }
