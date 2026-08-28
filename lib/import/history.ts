import 'server-only';

import { getValidationErrors, type ErrorCsvRow, type ImportBatchSummary } from './repository.ts';

export async function getImportHistory(): Promise<ImportBatchSummary[]> {
  const { supabase } = await import('../auth.ts').then(({ requireAdmin }) => requireAdmin());
  const { data, error } = await supabase.schema('core').from('import_batch_summary')
    .select('batch_id,file_name,import_type,import_mode,total_rows,success_rows,warning_rows,error_rows,status,rollback_supported,uploaded_at')
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportBatchSummary[];
}

export async function getImportValidationErrors(batchId: string): Promise<ErrorCsvRow[]> {
  return getValidationErrors(batchId);
}
