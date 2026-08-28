import Badge, { type BadgeTone } from '@/components/ui/badge';
import Button from '@/components/ui/button';
import DataTable from '@/components/ui/data-table';
import Panel from '@/components/ui/panel';
import { rollbackImportAction } from '@/app/(admin)/admin/data-management/actions';
import { canRollbackImport, type ImportBatchSummary } from '@/lib/import/repository';

export default function ImportHistory({ batches }: { batches: ImportBatchSummary[] }) {
  return <Panel title="Import History" meta={`${batches.length}건`}>
    <DataTable columns={[
      { key: 'file_name', label: '파일 / Batch', render: (batch) => <><strong>{String(batch.file_name)}</strong><br /><span className="muted">{String(batch.batch_id)}</span></> },
      { key: 'import_type', label: '유형' },
      { key: 'import_mode', label: '모드' },
      { key: 'rows', label: '결과', render: (batch) => <>전체 {Number(batch.total_rows)} · 성공 {Number(batch.success_rows)}<br />경고 {Number(batch.warning_rows)} · 오류 {Number(batch.error_rows)}</> },
      { key: 'status', label: '상태', render: (batch) => <Badge tone={statusTone(String(batch.status))}>{String(batch.status)}</Badge> },
      { key: 'uploaded_at', label: '시간', render: (batch) => formatDate(String(batch.uploaded_at)) },
      { key: 'actions', label: '관리', render: (batch) => <BatchActions batch={batch as ImportBatchSummary} /> },
    ]} rows={batches} rowKey={(batch) => String(batch.batch_id)} empty="아직 적재 이력이 없습니다." />
  </Panel>;
}

function BatchActions({ batch }: { batch: ImportBatchSummary }) {
  const canRollback = canRollbackImport({ mode: batch.import_mode, status: batch.status, rollbackSupported: batch.rollback_supported });
  return <div className="admin-actions">
    {(batch.error_rows > 0 || batch.warning_rows > 0) && <a className="button ghost" href={`/api/admin/import/error-csv?batchId=${encodeURIComponent(batch.batch_id)}`}>오류 CSV</a>}
    {canRollback && <form action={rollbackAction}><input type="hidden" name="batchId" value={batch.batch_id} /><Button type="submit">Batch rollback</Button></form>}
    {batch.import_mode === 'replace' && !batch.rollback_supported && <span className="muted">replace rollback 불가</span>}
  </div>;
}

function statusTone(status: string): BadgeTone {
  if (status === 'IMPORTED' || status === 'VALIDATED') return 'safe';
  if (status === 'PARSED') return 'warning';
  if (status === 'FAILED') return 'critical';
  return 'gray';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `— ${value || 'TIMESTAMP_UNAVAILABLE'}` : date.toLocaleString('ko-KR');
}

async function rollbackAction(formData: FormData): Promise<void> {
  'use server';
  await rollbackImportAction(formData);
}
