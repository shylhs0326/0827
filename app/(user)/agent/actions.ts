'use server';

import { requireUser } from '@/lib/auth';
import { saveTurn } from '@/lib/agent/conversation';
import { successStateAfterSave, validateQuestion, type AgentRequestState } from './state';

function configured(): boolean {
  return Boolean(
    process.env.OPENAI_BASE_URL?.trim()
    && process.env.OPENAI_API_KEY?.trim()
    && process.env.OPENAI_MODEL?.trim(),
  );
}

export async function submitAgent(
  _previousState: AgentRequestState,
  formData: FormData,
): Promise<AgentRequestState> {
  const { user, profile } = await requireUser();
  const question = String(formData.get('question') ?? '');
  const questionError = validateQuestion(question);
  if (questionError) return { status: 'error', error: questionError, answer: null, trace: [] };
  if (!configured()) {
    return {
      status: 'error',
      error: 'AI 연결 설정이 없어 질문을 보낼 수 없습니다.',
      answer: null,
      trace: [],
    };
  }

  try {
    const { runAgent } = await import('@/lib/agent/orchestrator');
    const result = await runAgent({
      question: question.trim(),
      user: { id: user.id, role: profile.role },
      history: [],
    });
    const saved = await saveTurn({
      title: question.trim().slice(0, 80),
      question: question.trim(),
      answer: result.answer,
      toolTrace: result.trace,
      usage: result.usage,
      guardrail: result.guardrail,
    });
    return successStateAfterSave(result.answer, result.trace, saved.error ? `답변은 표시되지만 대화 저장에 실패했습니다: ${saved.error}` : null);
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'AI 분석을 실행할 수 없습니다.',
      answer: null,
      trace: [],
    };
  }
}
