import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentAnswer } from './schema.ts';
import { toConversationSummary, toStoredMessage } from './conversation.ts';
import { successStateAfterSave, type AgentRequestState } from '../../app/(user)/agent/state.ts';

const answer: AgentAnswer = {
  answer: '최근 출고량은 12개입니다.',
  verdict: 'SUPPORTED',
  evidence: [],
  data_as_of: '2026-08',
  risk: null,
  recommended_action: null,
  cannot_answer: false,
  cannot_answer_reason: null,
};

test('normalizes conversation rows without exposing unrelated fields', () => {
  assert.deepEqual(toConversationSummary({
    id: 'c1', user_id: 'u1', user_email: 'u@example.com', title: '출고 질문',
    started_at: '2026-09-04T00:00:00Z', last_at: '2026-09-04T00:01:00Z', secret: '숨김',
  }), {
    id: 'c1', userId: 'u1', userEmail: 'u@example.com', title: '출고 질문',
    startedAt: '2026-09-04T00:00:00Z', lastAt: '2026-09-04T00:01:00Z',
  });
});

test('normalizes stored message JSON fields', () => {
  assert.deepEqual(toStoredMessage({
    id: 'm1', conversation_id: 'c1', role: 'assistant', content: answer.answer,
    answer, tool_trace: [{ name: 'trend', ok: true }], usage: { total_tokens: 10 }, guardrail: { ok: true },
    created_at: '2026-09-04T00:01:00Z',
  }), {
    id: 'm1', conversationId: 'c1', role: 'assistant', content: answer.answer,
    answer, toolTrace: [{ name: 'trend', ok: true }], usage: { total_tokens: 10 }, guardrail: { ok: true },
    createdAt: '2026-09-04T00:01:00Z',
  });
});

test('keeps the Agent answer when conversation persistence fails', () => {
  const state: AgentRequestState = successStateAfterSave(answer, [], '대화 저장에 실패했습니다.');
  assert.equal(state.status, 'success');
  assert.equal(state.answer, answer);
  assert.equal(state.error, '대화 저장에 실패했습니다.');
});
