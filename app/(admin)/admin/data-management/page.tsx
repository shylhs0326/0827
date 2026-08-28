import PageHeader from '@/components/shell/page-header';
import ImportHistory from '@/components/import/import-history';
import ImportWizard from '@/components/import/import-wizard';
import ValidationErrors from '@/components/import/validation-errors';
import Panel from '@/components/ui/panel';
import { requireAdmin } from '@/lib/auth';
import { getImportHistory, getImportValidationErrors } from '@/lib/import/history';

export const dynamic = 'force-dynamic';

export default async function DataManagementPage() {
  await requireAdmin();

  try {
    const history = await getImportHistory();
    const batchWithIssues = history.find((batch) => batch.error_rows > 0 || batch.warning_rows > 0);
    const validationErrors = batchWithIssues ? await getImportValidationErrors(batchWithIssues.batch_id) : [];

    return <div className="content">
      <PageHeader eyebrow="DATA MANAGEMENT" title="데이터 관리" description="파일을 staging에 저장하고 검증한 뒤, 관리자가 승인한 정상 행만 RAW 계층으로 적재합니다." />
      <ImportWizard />
      <ImportHistory batches={history} />
      <ValidationErrors batchId={batchWithIssues?.batch_id ?? null} errors={validationErrors} />
    </div>;
  } catch (error) {
    return <div className="content">
      <PageHeader eyebrow="DATA MANAGEMENT" title="데이터 관리" description="파일 적재 이력을 불러옵니다." />
      <Panel title="데이터 관리 상태"><p className="text-critical">적재 이력을 불러오지 못했습니다.</p><p className="muted">{error instanceof Error ? error.message : 'IMPORT_HISTORY_UNAVAILABLE'}</p></Panel>
    </div>;
  }
}
