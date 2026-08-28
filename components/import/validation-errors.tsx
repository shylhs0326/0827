import Badge from '@/components/ui/badge';
import DataTable from '@/components/ui/data-table';
import Panel from '@/components/ui/panel';
import type { ErrorCsvRow } from '@/lib/import/repository';

export default function ValidationErrors({ batchId, errors }: { batchId: string | null; errors: ErrorCsvRow[] }) {
  return <section id="validation-errors"><Panel title="Validation Errors" meta={batchId ? `Batch ${batchId}` : '선택된 오류 없음'}>
    {batchId && <div className="section-heading import-errors-heading"><span className="muted">선택한 batch의 행 단위 결과입니다.</span><a className="button ghost" href={`/api/admin/import/error-csv?batchId=${encodeURIComponent(batchId)}`}>오류 CSV 다운로드</a></div>}
    <DataTable columns={[
      { key: 'rowNumber', label: '행', align: 'right' },
      { key: 'errorCode', label: 'Reason code' },
      { key: 'errorMessage', label: '메시지' },
      { key: 'severity', label: '상태', render: (row) => <Badge tone={row.severity === 'ERROR' ? 'critical' : 'warning'}>{row.severity}</Badge> },
    ]} rows={errors} rowKey={(row, index) => `${row.rowNumber}-${row.errorCode}-${index}`} empty="표시할 Validation Error가 없습니다." />
  </Panel></section>;
}
