import { requireAdmin } from '@/lib/auth';
import { getErrorCsv } from '@/lib/import/repository';

export async function GET(request: Request) {
  await requireAdmin();
  const batchId = new URL(request.url).searchParams.get('batchId');
  if (!batchId) return Response.json({ error: 'batchId_REQUIRED' }, { status: 400 });

  const csv = await getErrorCsv(batchId);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import-errors-${encodeURIComponent(batchId)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
