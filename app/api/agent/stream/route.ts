import { requireUser } from '@/lib/auth';
import { saveTurn } from '@/lib/agent/conversation';
import { runAgent, type AgentProgress } from '@/lib/agent/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, profile } = await requireUser();
    let body: unknown;
    try { body = await request.json(); } catch { return jsonError('요청을 읽지 못했습니다.', 400); }
    const question = body && typeof body === 'object' && 'question' in body
      ? String((body as { question?: unknown }).question ?? '').trim()
      : '';
    if (!question) return jsonError('질문을 입력해 주세요.', 400);
    if (question.length > 500) return jsonError('질문은 500자 이내로 입력해 주세요.', 400);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (payload: unknown) => {
          if (!open) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { open = false; }
        };
        try {
          const result = await runAgent({
            question,
            user: { id: user.id, role: profile.role },
            history: [],
          }, { onProgress: (event: AgentProgress) => send({ type: 'progress', event }) });
          const saved = await saveTurn({
            title: question.slice(0, 80),
            question,
            answer: result.answer,
            toolTrace: result.trace,
            usage: result.usage,
            guardrail: result.guardrail,
          });
          send({ type: 'done', result: { answer: result.answer, trace: result.trace, saveWarning: saved.error } });
        } catch (error) {
          send({ type: 'done', result: { answer: null, trace: [], error: error instanceof Error ? error.message : '질문 처리에 실패했습니다.' } });
        } finally {
          if (open) controller.close();
          open = false;
        }
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '로그인 상태를 확인하지 못했습니다.', 401);
  }
}
