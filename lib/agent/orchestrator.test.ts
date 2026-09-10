import assert from 'node:assert/strict';
import test from 'node:test';
import { agentAnswerJsonSchema } from './schema.ts';
import { type AgentTool, type ToolResult } from './tools.ts';
import {
  runAgent,
  type AgentLlm,
  type AgentUser,
  type OrchestratorTool,
} from './orchestrator.ts';

const answerJson = JSON.stringify({
  answer: '출고 추세를 확인했습니다.',
  verdict: 'SUPPORTED',
  evidence: [],
  data_as_of: '2026-08',
  risk: null,
  recommended_action: null,
  cannot_answer: false,
  cannot_answer_reason: null,
});

const success: ToolResult = {
  ok: true,
  data: { latestQty: 12 },
  numbers: { latestQty: 12 },
  dataAsOf: '2026-08',
  reason: null,
};

function tool(name: string, roles: AgentTool['roles'] = ['USER']): OrchestratorTool {
  return {
    name,
    description: `${name} 설명`,
    parameters: {
      type: 'object',
      properties: { itemCode: { type: 'string' } },
      required: ['itemCode'],
      additionalProperties: false,
    },
    roles,
    run: async () => success,
  };
}

function llmSequence(responses: Awaited<ReturnType<AgentLlm>>[]): { llm: AgentLlm; requests: unknown[] } {
  let index = 0;
  const requests: unknown[] = [];
  return {
    requests,
    llm: async (request) => {
      requests.push(request);
      return responses[index++] ?? { error: '응답 없음' };
    },
  };
}

const user: AgentUser = { id: 'u1', role: 'USER' };

test('appends assistant tool_calls and matching tool messages before the explanation round', async () => {
  const call = { id: 'call-1', type: 'function' as const, function: { name: 'trend', arguments: '{"itemCode":"A"}' } };
  const fake = llmSequence([
    { message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] },
    { message: { role: 'assistant', content: answerJson }, toolCalls: [] },
  ]);
  const result = await runAgent({ question: 'A의 추세는?', user, history: [] }, { llm: fake.llm, tools: { trend: tool('trend') } });

  assert.equal(result.answer.verdict, 'SUPPORTED');
  const secondRequest = fake.requests[1] as { messages: Array<Record<string, unknown>> };
  assert.deepEqual(secondRequest.messages.slice(-2), [
    { role: 'assistant', content: null, tool_calls: [call] },
    { role: 'tool', content: JSON.stringify(success), tool_call_id: 'call-1' },
  ]);
  assert.equal(result.trace[0].name, 'trend');
  assert.equal(result.trace[0].ok, true);
});

test('does not execute a tool that is not allowed for the user role', async () => {
  let executions = 0;
  const forbidden = { ...tool('trend', ['ADMIN']), run: async () => { executions += 1; return success; } };
  const call = { id: 'call-2', type: 'function' as const, function: { name: 'trend', arguments: '{}' } };
  const fake: AgentLlm = async () => ({ message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] });

  const result = await runAgent({ question: '조회', user: { role: 'USER' }, history: [] }, { llm: fake, tools: { trend: forbidden } });

  assert.equal(executions, 0);
  assert.equal(result.answer.cannot_answer, true);
  assert.match(result.answer.cannot_answer_reason ?? '', /허용되지 않은 Tool/);
});

test('converts malformed tool arguments into cannotAnswer without executing the tool', async () => {
  let executions = 0;
  const candidate = { ...tool('trend'), run: async () => { executions += 1; return success; } };
  const call = { id: 'call-3', type: 'function' as const, function: { name: 'trend', arguments: '{bad-json' } };
  const fake: AgentLlm = async () => ({ message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] });

  const result = await runAgent({ question: '조회', user, history: [] }, { llm: fake, tools: { trend: candidate } });

  assert.equal(executions, 0);
  assert.equal(result.answer.verdict, 'CANNOT_ANSWER');
  assert.match(result.answer.cannot_answer_reason ?? '', /arguments/);
});

test('stops after six tool rounds and records each call in trace', async () => {
  let executions = 0;
  const candidate = { ...tool('trend'), run: async () => { executions += 1; return success; } };
  const fake: AgentLlm = async () => {
    const call = { id: `call-${executions + 1}`, type: 'function' as const, function: { name: 'trend', arguments: '{"itemCode":"A"}' } };
    return { message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] };
  };

  const result = await runAgent({ question: '반복 조회', user, history: [] }, { llm: fake, tools: { trend: candidate } });

  assert.equal(executions, 6);
  assert.equal(result.trace.length, 6);
  assert.equal(result.answer.verdict, 'CANNOT_ANSWER');
  assert.match(result.answer.cannot_answer_reason ?? '', /6회/);
});

test('exposes the answer schema to the initial LLM request', async () => {
  const fake = llmSequence([{ message: { role: 'assistant', content: answerJson }, toolCalls: [] }]);
  await runAgent({ question: '답변', user, history: [] }, { llm: fake.llm, tools: { trend: tool('trend') } });
  const request = fake.requests[0] as { response_format?: unknown };
  assert.deepEqual(request.response_format, { type: 'json_schema', json_schema: agentAnswerJsonSchema });
});

test('returns LLM usage, guardrail result, and safe progress events', async () => {
  const events: string[] = [];
  const fake: AgentLlm = async () => ({
    message: { role: 'assistant', content: answerJson },
    toolCalls: [],
    usage: { total_tokens: 17 },
  });
  const result = await runAgent(
    { question: '답변', user, history: [] },
    { llm: fake, tools: {}, onProgress: (event) => events.push(event.stage) },
  );

  assert.deepEqual(result.usage, { total_tokens: 17 });
  assert.equal(result.guardrail?.ok, true);
  assert.deepEqual(events, ['planning', 'answering', 'verifying']);
});

function numericAnswer(value: number): string {
  return JSON.stringify({
    answer: `최근 출고량은 ${value}개입니다.`,
    verdict: 'SUPPORTED',
    evidence: [],
    data_as_of: '2026-08',
    risk: null,
    recommended_action: null,
    cannot_answer: false,
    cannot_answer_reason: null,
  });
}

test('regenerates once when the explanation contains an unverified number', async () => {
  const call = { id: 'call-4', type: 'function' as const, function: { name: 'trend', arguments: '{"itemCode":"A"}' } };
  let calls = 0;
  const fake: AgentLlm = async (request) => {
    calls += 1;
    if (calls === 1) return { message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] };
    return { message: { role: 'assistant', content: numericAnswer(calls === 2 ? 99 : 12) }, toolCalls: [] };
  };

  const result = await runAgent({ question: '조회', user, history: [] }, { llm: fake, tools: { trend: tool('trend') } });

  assert.equal(calls, 3);
  assert.equal(result.answer.verdict, 'SUPPORTED');
  assert.match(result.answer.answer, /12개/);
});

test('discards the answer when the one allowed regeneration still contains an unverified number', async () => {
  const call = { id: 'call-5', type: 'function' as const, function: { name: 'trend', arguments: '{"itemCode":"A"}' } };
  let calls = 0;
  const fake: AgentLlm = async () => {
    calls += 1;
    if (calls === 1) return { message: { role: 'assistant', content: null, tool_calls: [call] }, toolCalls: [call] };
    return { message: { role: 'assistant', content: numericAnswer(99) }, toolCalls: [] };
  };

  const result = await runAgent({ question: '조회', user, history: [] }, { llm: fake, tools: { trend: tool('trend') } });

  assert.equal(calls, 3);
  assert.equal(result.answer.verdict, 'CANNOT_ANSWER');
  assert.match(result.answer.cannot_answer_reason ?? '', /출처 없는 숫자/);
});
