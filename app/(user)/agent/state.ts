import type { AgentAnswer } from '@/lib/agent/schema';
import type { AgentTrace } from '@/lib/agent/orchestrator';

export type AgentRequestState = {
  status: 'idle' | 'submitting' | 'success' | 'error';
  error: string | null;
  answer: AgentAnswer | null;
  trace: AgentTrace[];
};

export const initialAgentState: AgentRequestState = {
  status: 'idle',
  error: null,
  answer: null,
  trace: [],
};

export function successStateAfterSave(answer: AgentAnswer, trace: AgentTrace[], saveError: string | null): AgentRequestState {
  return { status: 'success', error: saveError, answer, trace };
}

export function validateQuestion(question: string): string | null {
  return question.trim() ? null : '질문을 입력해 주세요.';
}

export type AnswerView =
  | { kind: 'cannot-answer'; title: string; reason: string }
  | {
    kind: 'answer';
    title: string;
    answer: string;
    verdict: AgentAnswer['verdict'];
    evidence: AgentAnswer['evidence'];
    risk: string | null;
    recommendedAction: string | null;
    dataAsOf: string | null;
  };

export function getAnswerView(answer: AgentAnswer): AnswerView {
  if (answer.cannot_answer || answer.verdict === 'CANNOT_ANSWER') {
    return {
      kind: 'cannot-answer',
      title: '계산 불가',
      reason: answer.cannot_answer_reason ?? answer.answer,
    };
  }
  return {
    kind: 'answer',
    title: '분석 결과',
    answer: answer.answer,
    verdict: answer.verdict,
    evidence: answer.evidence,
    risk: answer.risk,
    recommendedAction: answer.recommended_action,
    dataAsOf: answer.data_as_of,
  };
}
