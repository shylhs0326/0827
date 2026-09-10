import assert from 'node:assert/strict';
import test from 'node:test';
import { callChatCompletions, type ChatMessage, type LlmToolCall } from './llm.ts';

const originalEnv = {
  baseUrl: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
};

function setEnv(values: Partial<typeof originalEnv> = {}) {
  process.env.OPENAI_BASE_URL = values.baseUrl ?? ' https://example.test/ ';
  process.env.OPENAI_API_KEY = values.apiKey ?? ' secret-key ';
  process.env.OPENAI_MODEL = values.model ?? ' model-a ';
}

function restoreEnv() {
  for (const [key, value] of Object.entries({
    OPENAI_BASE_URL: originalEnv.baseUrl,
    OPENAI_API_KEY: originalEnv.apiKey,
    OPENAI_MODEL: originalEnv.model,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test.afterEach(restoreEnv);

test('returns a configuration error without calling fetch when an environment value is missing', async () => {
  setEnv({ apiKey: undefined });
  delete process.env.OPENAI_API_KEY;
  let calls = 0;

  const result = await callChatCompletions({ messages: [{ role: 'user', content: '안녕' }] }, {
    fetch: async () => {
      calls += 1;
      return response({});
    },
  });

  assert.deepEqual(result, { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' });
  assert.equal(calls, 0);
});

test('trims environment values for the URL, model, and authorization header', async () => {
  setEnv();
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const result = await callChatCompletions({ messages: [{ role: 'user', content: '안녕' }] }, {
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response({ choices: [{ message: { role: 'assistant', content: '반가워요' } }] });
    },
  });

  assert.equal('error' in result, false);
  assert.equal(requestUrl, 'https://example.test/chat/completions');
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, 'Bearer secret-key');
  assert.equal(JSON.parse(String(requestInit?.body)).model, 'model-a');
});

test('parses assistant content and tool_calls without throwing', async () => {
  setEnv();
  const toolCall: LlmToolCall = {
    id: 'call-1',
    type: 'function',
    function: { name: 'getShipmentTrend', arguments: '{"itemCode":"A"}' },
  };
  const result = await callChatCompletions({
    messages: [{ role: 'user', content: '출고 추세를 알려줘' }],
    tools: [{ type: 'function', function: { name: 'getShipmentTrend', description: '조회', parameters: {} } }],
    tool_choice: 'auto',
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: { name: 'agent_answer', strict: true, schema: {} } },
  }, { fetch: async () => response({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [toolCall] } }] }) });

  assert.deepEqual(result, {
    message: { role: 'assistant', content: null, tool_calls: [toolCall] },
    toolCalls: [toolCall],
  });
});

test('retries json_schema 400 once with json_object and remembers the model', async () => {
  setEnv({ baseUrl: 'https://fallback-json.test', model: 'json-model' });
  const bodies: Record<string, unknown>[] = [];
  let calls = 0;
  const fetch = async (_input: string | URL, init?: RequestInit) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)));
    return calls === 1
      ? response({ error: { message: 'json_schema is not supported' } }, 400)
      : calls === 2
        ? response({ choices: [{ message: { role: 'assistant', content: '{}' } }] })
        : response({ error: { message: 'json_schema is not supported' } }, 400);
  };
  const request = { messages: [{ role: 'user', content: '답변' }] as ChatMessage[], response_format: { type: 'json_schema' as const, json_schema: { name: 'answer', strict: true, schema: {} } } };

  const first = await callChatCompletions(request, { fetch });
  const second = await callChatCompletions(request, { fetch });

  assert.equal('error' in first, false);
  assert.match('error' in second ? second.error : '', /json_schema is not supported/);
  assert.equal(calls, 3);
  assert.equal((bodies[1].response_format as { type: string }).type, 'json_object');
  assert.equal((bodies[2].response_format as { type: string }).type, 'json_schema');
});

test('retries a temperature 400 once without temperature and remembers the model', async () => {
  setEnv({ baseUrl: 'https://fallback-temperature.test', model: 'temperature-model' });
  const bodies: Record<string, unknown>[] = [];
  let calls = 0;
  const fetch = async (_input: string | URL, init?: RequestInit) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)));
    return calls === 1
      ? response({ error: { message: "'temperature' does not support 0 with this model" } }, 400)
      : calls === 2
        ? response({ choices: [{ message: { role: 'assistant', content: '{}' } }] })
        : response({ error: { message: "'temperature' does not support 0 with this model" } }, 400);
  };
  const request = { messages: [{ role: 'user', content: '답변' }] as ChatMessage[], temperature: 0 };

  const first = await callChatCompletions(request, { fetch });
  const second = await callChatCompletions(request, { fetch });

  assert.equal('error' in first, false);
  assert.match('error' in second ? second.error : '', /temperature/);
  assert.equal(calls, 3);
  assert.equal(bodies[1].temperature, undefined);
  assert.equal(bodies[2].temperature, 0);
});

test('returns a timeout error when the injected fetch does not complete', async () => {
  setEnv({ baseUrl: 'https://timeout.test', model: 'timeout-model' });
  const result = await callChatCompletions({ messages: [{ role: 'user', content: '대기' }] }, {
    timeoutMs: 10,
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('시간 초과', 'AbortError')));
    }),
  });

  assert.deepEqual(result, { error: '요청 시간이 초과되었습니다.' });
});
