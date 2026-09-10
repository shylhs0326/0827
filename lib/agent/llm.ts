export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type LlmToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
};

export type ChatTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: Record<string, unknown> };

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: 'auto';
  temperature?: number;
  response_format?: ResponseFormat;
};

export type ChatResult = {
  message: ChatMessage;
  toolCalls: LlmToolCall[];
  usage?: Record<string, unknown> | null;
  fallbackUsed?: 'json_object' | 'no_temperature' | null;
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type LlmCallOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
};

const fallbackUsed = new Set<string>();

function configurationError(): string | null {
  if (!process.env.OPENAI_BASE_URL?.trim()) return 'OPENAI_BASE_URL가 설정되지 않았습니다.';
  if (!process.env.OPENAI_API_KEY?.trim()) return 'OPENAI_API_KEY가 설정되지 않았습니다.';
  if (!process.env.OPENAI_MODEL?.trim()) return 'OPENAI_MODEL이 설정되지 않았습니다.';
  return null;
}

function errorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
    const error = parsed.error;
    const message = typeof error === 'string' ? error : error?.message;
    if (typeof message === 'string' && message) return `HTTP ${status}: ${message}`;
  } catch {
    // JSON이 아닌 오류 본문은 아래 원문 처리로 넘어갑니다.
  }
  return body.trim() ? `HTTP ${status}: ${body.trim()}` : `HTTP ${status}`;
}

function parseSuccess(body: string, fallbackUsed: ChatResult['fallbackUsed'] = null): ChatResult | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: '응답 JSON을 해석할 수 없습니다.' };
  }

  const message = (parsed as { choices?: Array<{ message?: unknown }> })?.choices?.[0]?.message;
  if (!message || typeof message !== 'object') return { error: '응답에 assistant message가 없습니다.' };

  const candidate = message as Record<string, unknown>;
  if (candidate.role !== 'assistant' || (candidate.content !== null && typeof candidate.content !== 'string')) {
    return { error: 'assistant message 형식이 올바르지 않습니다.' };
  }
  const rawToolCalls = candidate.tool_calls;
  if (rawToolCalls !== undefined && !Array.isArray(rawToolCalls)) return { error: 'tool_calls 형식이 올바르지 않습니다.' };
  const toolCalls = (rawToolCalls ?? []) as LlmToolCall[];
  const usage = (parsed as { usage?: unknown }).usage;
  const result: ChatResult = {
    message: candidate as ChatMessage,
    toolCalls,
  };
  if (usage && typeof usage === 'object' && !Array.isArray(usage)) result.usage = usage as Record<string, unknown>;
  if (fallbackUsed) result.fallbackUsed = fallbackUsed;
  return result;
}

function fallbackRequest(request: ChatRequest, body: string): ChatRequest | null {
  if (request.response_format?.type === 'json_schema' && body.toLowerCase().includes('json_schema')) {
    return { ...request, response_format: { type: 'json_object' } };
  }
  if (body.toLowerCase().includes('temperature')) {
    const retry = { ...request };
    delete retry.temperature;
    return retry;
  }
  return null;
}

export async function callChatCompletions(
  request: ChatRequest,
  options: LlmCallOptions = {},
): Promise<ChatResult | { error: string }> {
  const configError = configurationError();
  if (configError) return { error: configError };

  const baseUrl = process.env.OPENAI_BASE_URL!.trim().replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const model = process.env.OPENAI_MODEL!.trim();
  const key = `${baseUrl}|${model}`;
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const send = async (payload: ChatRequest): Promise<{ ok: true; body: string } | { ok: false; status: number; body: string } | { timeout: true } | { networkError: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, ...payload }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) return { ok: false, status: response.status, body };
      return { ok: true, body };
    } catch (error) {
      if (controller.signal.aborted) return { timeout: true };
      return { networkError: error instanceof Error ? error.message : '네트워크 요청에 실패했습니다.' };
    } finally {
      clearTimeout(timer);
    }
  };

  let payload = request;
  let usedFallback: ChatResult['fallbackUsed'] = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await send(payload);
    if ('timeout' in response) return { error: '요청 시간이 초과되었습니다.' };
    if ('networkError' in response) return { error: response.networkError };
    if (response.ok) return parseSuccess(response.body, usedFallback);

    if (response.status === 400 && !fallbackUsed.has(key)) {
      const retry = fallbackRequest(payload, response.body);
      if (retry) {
        fallbackUsed.add(key);
        payload = retry;
        usedFallback = retry.response_format?.type === 'json_object' ? 'json_object' : 'no_temperature';
        continue;
      }
    }
    return { error: errorMessage(response.body, response.status) };
  }
  return { error: 'LLM 요청에 실패했습니다.' };
}
