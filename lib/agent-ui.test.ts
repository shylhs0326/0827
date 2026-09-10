import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentAnswer } from './agent/schema.ts';
import { getAnswerView, initialAgentState, validateQuestion } from '../app/(user)/agent/state.ts';
import { userMenu } from './menu.ts';

const normalAnswer: AgentAnswer = {
  answer: '최근 출고량은 12개입니다.',
  verdict: 'SUPPORTED',
  evidence: [{ source: 'trend.latestQty', claim: '최근 출고량', value: 12 }],
  data_as_of: '2026-08',
  risk: null,
  recommended_action: '추세를 계속 확인하세요.',
  cannot_answer: false,
  cannot_answer_reason: null,
};

test('rejects blank questions before submitting', () => {
  assert.equal(validateQuestion('   '), '질문을 입력해 주세요.');
  assert.equal(validateQuestion('재고 위험을 알려줘'), null);
  assert.equal(initialAgentState.status, 'idle');
});

test('renders a cannot-answer view with its reason', () => {
  const answer: AgentAnswer = {
    ...normalAnswer,
    answer: '현재 질문에 답할 수 없습니다.',
    verdict: 'CANNOT_ANSWER',
    cannot_answer: true,
    cannot_answer_reason: '관측 데이터가 부족합니다.',
  };
  assert.deepEqual(getAnswerView(answer), {
    kind: 'cannot-answer',
    title: '계산 불가',
    reason: '관측 데이터가 부족합니다.',
  });
});

test('renders a normal structured answer with evidence and metadata', () => {
  assert.deepEqual(getAnswerView(normalAnswer), {
    kind: 'answer',
    title: '분석 결과',
    answer: '최근 출고량은 12개입니다.',
    verdict: 'SUPPORTED',
    evidence: normalAnswer.evidence,
    risk: null,
    recommendedAction: '추세를 계속 확인하세요.',
    dataAsOf: '2026-08',
  });
});

test('adds the Agent page to the user menu', () => {
  assert.ok(userMenu.some((item) => item.href === '/agent'));
});
