import assert from 'node:assert/strict';
import test from 'node:test';
import { agentAnswerJsonSchema, cannotAnswer, parseAgentAnswer } from './schema.ts';

const validAnswer = {
  answer: '현재 재고로 계획 리드타임을 충족할 수 있습니다.',
  verdict: 'SUPPORTED',
  evidence: [{ source: 'analytics.v_stockout_risk', claim: 'stockout_days', value: 42 }],
  data_as_of: '2026-09-04',
  risk: null,
  recommended_action: null,
  cannot_answer: false,
  cannot_answer_reason: null,
};

test('parses a valid agent answer with the complete contract', () => {
  assert.deepEqual(parseAgentAnswer(JSON.stringify(validAnswer)), validAnswer);
});

test('rejects malformed JSON', () => {
  assert.throws(() => parseAgentAnswer('{not-json}'), /JSON 형식이 올바르지 않습니다/);
});

test('rejects an answer with a missing required field', () => {
  const { risk: _risk, ...missingRisk } = validAnswer;
  assert.throws(() => parseAgentAnswer(missingRisk), /필수 필드가 없습니다: risk/);
});

test('creates a parseable cannot-answer response for an uncomputable result', () => {
  const result = cannotAnswer('사용 이력이 없어 계산할 수 없습니다.');

  assert.deepEqual(result, {
    answer: '현재 질문에 답할 수 없습니다.',
    verdict: 'CANNOT_ANSWER',
    evidence: [],
    data_as_of: null,
    risk: null,
    recommended_action: null,
    cannot_answer: true,
    cannot_answer_reason: '사용 이력이 없어 계산할 수 없습니다.',
  });
  assert.deepEqual(parseAgentAnswer(result), result);
});

test('uses strict JSON Schema requirements for every object', () => {
  const schema = agentAnswerJsonSchema.schema as Record<string, unknown>;
  const evidence = schema.properties as Record<string, unknown>;
  const evidenceItems = (evidence.evidence as Record<string, unknown>).items as Record<string, unknown>;

  assert.equal(agentAnswerJsonSchema.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, Object.keys(schema.properties as object));
  assert.equal(evidenceItems.additionalProperties, false);
  assert.deepEqual(evidenceItems.required, Object.keys(evidenceItems.properties as object));
});
