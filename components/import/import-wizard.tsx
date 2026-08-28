'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/panel';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { getImportSchema } from '@/lib/import/schema';
import { importModes, importTypes, type ColumnMapping, type ImportMode, type ImportType } from '@/lib/import/types';
import type { ImportBatchSummary, ImportPreview } from '@/lib/import/repository';
import { approveImportAction, stageImportAction, validateImportAction } from '@/app/(admin)/admin/data-management/actions';

type WizardError = { code: string; message: string };
const typeLabels: Record<ImportType, string> = { usage_history: '사용 이력', inventory: '재고', item_master: '품목 마스터', supplier_master: '공급처 마스터', purchase_order: '발주', goods_receipt: '입고', sales_order: '수주', business_event: '업무 이벤트' };
const modeLabels: Record<ImportMode, string> = { append: '추가', upsert: '갱신 또는 추가', replace: '대체' };

export default function ImportWizard() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<ImportType>('usage_history');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [batch, setBatch] = useState<ImportBatchSummary | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [replaceConfirmation, setReplaceConfirmation] = useState('');
  const [error, setError] = useState<WizardError | null>(null);
  const schema = useMemo(() => getImportSchema(importType), [importType]);

  const stage = () => {
    if (!file) { setError({ code: 'IMPORT_FILE_REQUIRED', message: 'CSV 또는 XLSX 파일을 선택하세요.' }); return; }
    const formData = new FormData();
    formData.set('file', file);
    formData.set('importType', importType);
    formData.set('importMode', importMode);
    setError(null);
    startTransition(async () => {
      try {
        const result = await stageImportAction(formData);
        setBatchId(result.batchId);
        setMapping(result.mapping);
        setPreview(result.preview);
        setMappingConfirmed(false);
        setBatch(null);
        setReplaceConfirmation('');
      } catch (cause) { setError(toWizardError(cause)); }
    });
  };

  const resetUpload = () => {
    setFile(null);
    setBatchId(null);
    setMapping({});
    setMappingConfirmed(false);
    setBatch(null);
    setPreview(null);
    setReplaceConfirmation('');
    setError(null);
  };

  const validate = () => {
    if (!batchId || !mappingConfirmed) return;
    const formData = new FormData();
    formData.set('batchId', batchId);
    formData.set('mapping', JSON.stringify(mapping));
    setError(null);
    startTransition(async () => {
      try { setBatch(await validateImportAction(formData)); router.refresh(); } catch (cause) { setError(toWizardError(cause)); }
    });
  };

  const approve = () => {
    if (!batch || batch.status !== 'VALIDATED' || batch.error_rows > 0) return;
    const formData = new FormData();
    formData.set('batchId', batch.batch_id);
    if (batch.import_mode === 'replace') formData.set('replaceConfirmation', replaceConfirmation);
    setError(null);
    startTransition(async () => {
      try { setBatch(await approveImportAction(formData)); router.refresh(); } catch (cause) { setError(toWizardError(cause)); }
    });
  };

  const updateMapping = (standardField: string, sourceHeader: string) => {
    setMapping((current) => sourceHeader ? { ...current, [standardField]: sourceHeader } : Object.fromEntries(Object.entries(current).filter(([key]) => key !== standardField)));
    setMappingConfirmed(false);
  };

  const validationReady = Boolean(batchId && mappingConfirmed && !isPending);
  const importReady = Boolean(batch && batch.status === 'VALIDATED' && batch.error_rows === 0 && (batch.import_mode !== 'replace' || replaceConfirmation === 'REPLACE') && !isPending);

  return <Panel title="File Upload" meta={batchId ? `Batch ${batchId}` : 'CSV · XLSX'} className="import-wizard">
    <div className="import-step-grid">
      <label className="form-label">파일<input className="form-input" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} /></label>
      <label className="form-label">데이터 종류<select className="form-input" value={importType} disabled={Boolean(batchId)} onChange={(event) => setImportType(event.target.value as ImportType)}>{importTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
      <label className="form-label">적재 모드<select className="form-input" value={importMode} disabled={Boolean(batchId)} onChange={(event) => setImportMode(event.target.value as ImportMode)}>{importModes.map((mode) => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
      <div className="import-action"><Button variant="primary" type="button" onClick={stage} disabled={isPending || Boolean(batchId)}>{isPending ? '처리 중…' : '1. Preview 생성'}</Button>{batchId && <Button variant="secondary" type="button" onClick={resetUpload} disabled={isPending}>새 업로드</Button>}</div>
    </div>

    {preview && <div className="import-preview"><div className="section-heading"><div><strong>2. 미리보기</strong><p className="muted">전체 {preview.totalRows ?? 0}행 중 첫 {preview.rows.length}행입니다. 원본 컬럼과 데이터를 확인한 뒤 매핑을 확정하세요.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>행</th>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{preview.headers.map((header) => <td key={header}>{row.values[header] ?? '—'}</td>)}</tr>)}</tbody></table></div></div>}

    {batchId && <div className="import-mapping"><div className="section-heading"><div><strong>3. Column Mapping 확인</strong><p className="muted">자동 제안값을 검토하고 확정해야 서버 검증을 시작할 수 있습니다.</p></div><Badge tone={mappingConfirmed ? 'safe' : 'warning'}>{mappingConfirmed ? 'CONFIRMED' : 'REVIEW REQUIRED'}</Badge></div>
      <div className="mapping-grid">{schema.fields.map((field) => <label className="form-label" key={field.standardField}><span>{field.standardField}{schema.requiredFields.includes(field.standardField) ? ' *' : ''}</span><input className="form-input" value={mapping[field.standardField] ?? ''} placeholder="원본 컬럼명" onChange={(event) => updateMapping(field.standardField, event.target.value)} /></label>)}</div>
      <label className="check-row"><input type="checkbox" checked={mappingConfirmed} onChange={(event) => setMappingConfirmed(event.target.checked)} />위 매핑이 원본 파일 컬럼과 일치함을 확인했습니다.</label>
      <div className="button-row"><Button variant="secondary" type="button" onClick={validate} disabled={!validationReady}>{isPending ? '검증 중…' : '4. 서버 검증 실행'}</Button>{batch && <ValidationSummary batch={batch} />}</div>
    </div>}

    {batch && <div className="import-approval"><div className="section-heading"><div><strong>5. Import 승인</strong><p className="muted">ERROR 행이 있으면 적재할 수 없으며, 정상 및 WARNING 행만 승인 대상이 됩니다.</p></div>{batch.error_rows > 0 && <a className="button ghost" href={`/api/admin/import/error-csv?batchId=${encodeURIComponent(batch.batch_id)}`}>오류 CSV 다운로드</a>}</div>
      {batch.import_mode === 'replace' && <div className="import-replace-warning"><Badge tone="critical">ROLLBACK UNAVAILABLE</Badge><span>replace 적재는 이전 데이터를 대체하며 batch rollback을 지원하지 않습니다.</span><label className="form-label"><span>승인 확인</span><input className="form-input" value={replaceConfirmation} placeholder="REPLACE 입력" onChange={(event) => setReplaceConfirmation(event.target.value)} /></label></div>}
      <Button variant="primary" type="button" onClick={approve} disabled={!importReady}>{isPending ? '적재 중…' : '승인 후 RAW 적재'}</Button>
    </div>}

    {error && <div className="import-action-error" role="alert" aria-live="assertive"><Badge tone="critical">{error.code}</Badge><span>{error.message}</span></div>}
  </Panel>;
}

function ValidationSummary({ batch }: { batch: ImportBatchSummary }) {
  return <div className="import-validation-summary"><Badge tone={batch.error_rows > 0 ? 'critical' : batch.warning_rows > 0 ? 'warning' : 'safe'}>{batch.status}</Badge><span>SUCCESS {batch.success_rows}</span><span>WARNING {batch.warning_rows}</span><span>ERROR {batch.error_rows}</span></div>;
}

function toWizardError(cause: unknown): WizardError {
  const message = cause instanceof Error ? cause.message : 'IMPORT_PIPELINE_FAILED';
  return { code: message.split(':')[0] || 'IMPORT_PIPELINE_FAILED', message };
}
