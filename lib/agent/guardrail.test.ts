import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentAnswer } from './schema.ts';
import type { ToolResult } from './tools.ts';
import {
  buildAllowedNumbers,
  extractAnswerNumbers,
  validateAnswerNumbers,
  type ToolNumberSource,
} from './guardrail.ts';

function answer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    answer: '최근 출고량은 1,049.5개입니다.',
    verdict: 'SUPPORTED',
    evidence: [],
    data_as_of: '2026-07',
    risk: null,
    recommended_action: 'P80 기준을 참고하세요.',
    cannot_answer: false,
    cannot_answer_reason: null,
    ...overrides,
  };
}

function source(name: string, numbers: Record<string, number | null>): ToolNumberSource {
  const result: ToolResult = {
    ok: true,
    data: null,
    numbers: Object.fromEntries(Object.entries(numbers).filter(([, value]) => value !== null)) as Record<string, number>,
    dataAsOf: '2026-07',
    reason: null,
  };
  return { name, result };
}

const allowed = buildAllowedNumbers([
  source('trend', { latestQty: 1049.5, average: 772.34, bias: -0.125, ratio: 0.12, ignored: null }),
]);

test('extracts comma-separated decimals from the answer body', () => {
  assert.deepEqual(extractAnswerNumbers(answer({ answer: '수량은 1,049.5개, 평균은 772.34개입니다.' })), [1049.5, 772.34]);
});

test('extracts negative numbers from evidence values and reasons', () => {
  assert.deepEqual(extractAnswerNumbers(answer({
    answer: 'Bias를 확인합니다.',
    evidence: [{ source: 'OL', claim: 'Bias는 -0.125입니다.', value: -0.125 }],
    cannot_answer_reason: null,
  })), [-0.125, -0.125]);
});

test('converts a percentage only when matching an allowed 0-to-1 ratio', () => {
  assert.deepEqual(extractAnswerNumbers(answer({ answer: '무수요율은 12%입니다.' })), [0.12]);
});

test('ignores item codes, model codes, P80, dates, months, and list numbers', () => {
  assert.deepEqual(extractAnswerNumbers(answer({ answer: '1. 602K02693은 MDL121에서 P80 2026-07에 확인됩니다.' })), []);
});

test('extracts numbers from recommended_action', () => {
  assert.deepEqual(extractAnswerNumbers(answer({ answer: '수량은 확인되었습니다.', recommended_action: '평균 772.34를 기준으로 30일 안전재고를 검토하세요.' })), [772.34, 30]);
});

test('normal answer numbers pass against tool numbers', () => {
  const result = validateAnswerNumbers(answer(), allowed);
  assert.deepEqual(result, { ok: true, unverified: [] });
});

test('rounded display values pass against precise tool numbers', () => {
  const result = validateAnswerNumbers(answer({ answer: '평균은 772.3개입니다.' }), allowed);
  assert.deepEqual(result, { ok: true, unverified: [] });
});

test('null tool numbers are not treated as allowed zero values', () => {
  const result = validateAnswerNumbers(answer({ answer: '값은 0입니다.' }), buildAllowedNumbers([source('trend', { missing: null })]));
  assert.equal(result.ok, false);
  assert.deepEqual(result.unverified, [0]);
});

test('merges allowed numbers with the toolName.key prefix', () => {
  assert.deepEqual(buildAllowedNumbers([source('trend', { latestQty: 1049.5 })]), { 'trend.latestQty': 1049.5 });
});

test('rejects a fabricated quantity', () => {
  assert.equal(validateAnswerNumbers(answer({ answer: '최근 출고량은 1,051개입니다.' }), allowed).ok, false);
});

test('rejects a fabricated decimal', () => {
  assert.equal(validateAnswerNumbers(answer({ answer: '평균은 771.1개입니다.' }), allowed).ok, false);
});

test('rejects a fabricated negative bias', () => {
  assert.equal(validateAnswerNumbers(answer({ answer: 'Bias는 -0.2입니다.' }), allowed).ok, false);
});

test('rejects a fabricated percentage', () => {
  assert.equal(validateAnswerNumbers(answer({ answer: '무수요율은 15%입니다.' }), allowed).ok, false);
});

test('rejects a fabricated evidence value', () => {
  assert.equal(validateAnswerNumbers(answer({ evidence: [{ source: 'trend.latestQty', claim: '최근량', value: 999 }] }), allowed).ok, false);
});

test('reports every unverified number rather than throwing', () => {
  const result = validateAnswerNumbers(answer({ answer: '1,051개와 771.1개입니다.' }), allowed);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unverified, [1051, 771.1]);
});
