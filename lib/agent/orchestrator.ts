import { agentAnswerJsonSchema, cannotAnswer, parseAgentAnswer, type AgentAnswer } from './schema.ts';
import { buildAllowedNumbers, validateAnswerNumbers, type ToolNumberSource } from './guardrail.ts';
import {
  callChatCompletions,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ChatTool,
  type LlmToolCall,
} from './llm.ts';
import { getAgentToolsForRole, type AgentTool, type ToolResult } from './tools.ts';

export type AgentUser = {
  id?: string;
  role: string;
};

export type OrchestratorTool = AgentTool<any>;
export type AgentLlm = (request: ChatRequest) => Promise<ChatResult | { error: string }>;

export type AgentTrace = {
  name: string;
  args: unknown;
  ok: boolean;
  ms: number;
  reason: string | null;
};

export type RunAgentInput = {
  question: string;
  user: AgentUser;
  history: ChatMessage[];
};

export type RunAgentOptions = {
  llm?: AgentLlm;
  tools?: Record<string, OrchestratorTool>;
  timeoutMs?: number;
  onProgress?: (event: AgentProgress) => void;
};

export type AgentProgress =
  | { stage: 'planning'; round: number }
  | { stage: 'tool_start'; round: number; name: string }
  | { stage: 'tool_end'; round: number; name: string; ok: boolean }
  | { stage: 'answering'; round: number }
  | { stage: 'verifying'; round: number }
  | { stage: 'regenerating'; round: number };

export type RunAgentResult = {
  answer: AgentAnswer;
  trace: AgentTrace[];
  history: ChatMessage[];
  usage: Record<string, unknown> | null;
  guardrail: Record<string, unknown> | null;
};

const MAX_TOOL_ROUNDS = 6;
const DEFAULT_TIMEOUT_MS = 60_000;

function cannot(reason: string, trace: AgentTrace[], history: ChatMessage[], usage: Record<string, unknown> | null = null, guardrail: Record<string, unknown> | null = null): RunAgentResult {
  return { answer: cannotAnswer(reason), trace, history, usage, guardrail: guardrail ?? { ok: false, reason } };
}

function emit(options: RunAgentOptions, event: AgentProgress): void {
  try { options.onProgress?.(event); } catch { /* 진행 알림 실패는 Agent 실행을 중단하지 않는다. */ }
}

function systemPrompt(role: string): ChatMessage {
  return { role: 'system', content: `당신은 SCM 운영 분석 Agent입니다. 역할은 ${role}입니다. 제공된 Tool 결과에 있는 수치만 사용하고, 계산할 수 없으면 반드시 계산 불가로 답하세요.` };
}

function toLlmTool(tool: OrchestratorTool): ChatTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toolMessage(call: LlmToolCall, result: ToolResult): ChatMessage {
  return {
    role: 'tool',
    content: JSON.stringify(result),
    tool_call_id: call.id,
  };
}

async function withinDeadline<T>(work: Promise<T>, deadline: number): Promise<T | { timedOut: true }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { timedOut: true };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), remaining);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function finalAnswer(result: ChatResult): AgentAnswer | { error: string } {
  if (!result.message.content) return { error: 'LLM 설명이 비어 있습니다.' };
  try {
    return parseAgentAnswer(result.message.content);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'LLM 설명을 해석할 수 없습니다.' };
  }
}

async function validateOrRegenerate(
  answer: AgentAnswer,
  request: ChatRequest,
  llm: AgentLlm,
  deadline: number,
  sources: ToolNumberSource[],
  messages: ChatMessage[],
  onProgress?: (event: AgentProgress) => void,
  round = 0,
): Promise<{ answer: AgentAnswer; guardrail: Record<string, unknown> } | { error: string }> {
  const allowed = buildAllowedNumbers(sources);
  const firstCheck = validateAnswerNumbers(answer, allowed);
  if (firstCheck.ok) return { answer, guardrail: { ok: true, checked: extractCount(answer), unverified: [] } };

  messages.push({
    role: 'user',
    content: `숫자 검증에 실패했습니다. 출처 없는 숫자를 제거하거나 Tool 결과에 있는 값으로 고쳐 한 번만 다시 답하세요: ${firstCheck.unverified.join(', ')}`,
  });
  emit({ onProgress }, { stage: 'regenerating', round });
  const retry = await withinDeadline(llm(request), deadline);
  if ('timedOut' in retry) return { error: '전체 Agent 실행 시간이 초과되었습니다.' };
  if ('error' in retry) return { error: `LLM 재생성 실패: ${retry.error}` };
  if (retry.toolCalls.length > 0) return { error: '숫자 검증 재생성에서 Tool 호출이 반환되었습니다.' };

  const regenerated = finalAnswer(retry);
  if ('error' in regenerated) return regenerated;
  const secondCheck = validateAnswerNumbers(regenerated, allowed);
  if (!secondCheck.ok) return { error: `출처 없는 숫자: ${secondCheck.unverified.join(', ')}` };
  return { answer: regenerated, guardrail: { ok: true, checked: extractCount(regenerated), unverified: [] } };
}

function extractCount(answer: AgentAnswer): number {
  return [answer.answer, answer.verdict, answer.evidence, answer.recommended_action, answer.cannot_answer_reason]
    .filter((value) => value !== null && value !== undefined).length;
}

export async function runAgent(
  input: RunAgentInput,
  options: RunAgentOptions = {},
): Promise<RunAgentResult> {
  const trace: AgentTrace[] = [];
  const messages = [systemPrompt(input.user.role), ...input.history, { role: 'user' as const, content: input.question }];
  const allTools = options.tools ?? agentTools;
  const llm = options.llm ?? callChatCompletions;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const numberSources: ToolNumberSource[] = [];
  let usage: Record<string, unknown> | null = null;
  let guardrail: Record<string, unknown> | null = null;

  try {
    const allowedTools = Object.values(allTools).filter((tool) => tool.roles.includes(input.user.role as never));
    const requestBase = {
      messages,
      tools: allowedTools.map(toLlmTool),
      tool_choice: 'auto' as const,
      temperature: 0,
      response_format: { type: 'json_schema' as const, json_schema: agentAnswerJsonSchema },
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      emit(options, { stage: 'planning', round });
      const llmResult = await withinDeadline(llm(requestBase), deadline);
      if ('timedOut' in llmResult) return cannot('전체 Agent 실행 시간이 초과되었습니다.', trace, messages);
      if ('error' in llmResult) return cannot(`LLM 호출 실패: ${llmResult.error}`, trace, messages);

      const calls = llmResult.toolCalls;
      if (calls.length === 0) {
        emit(options, { stage: 'answering', round });
        const answer = finalAnswer(llmResult);
        if ('error' in answer) return cannot(`LLM 설명 실패: ${answer.error}`, trace, messages);
        emit(options, { stage: 'verifying', round });
        const checked = await validateOrRegenerate(answer, requestBase, llm, deadline, numberSources, messages, options.onProgress, round);
        if ('error' in checked) return cannot(checked.error, trace, messages);
        usage = llmResult.usage ?? null;
        guardrail = checked.guardrail;
        return { answer: checked.answer, trace, history: messages, usage, guardrail };
      }

      messages.push(llmResult.message);

      for (const call of calls) {
        emit(options, { stage: 'tool_start', round, name: call.function.name });
        const started = Date.now();
        const currentAllowed = Object.values(allTools).filter((tool) => tool.roles.includes(input.user.role as never));
        const selected = currentAllowed.find((tool) => tool.name === call.function.name);
        if (!selected) {
          trace.push({ name: call.function.name, args: call.function.arguments, ok: false, ms: Date.now() - started, reason: '허용되지 않은 Tool입니다.' });
          return cannot('허용되지 않은 Tool 호출입니다.', trace, messages);
        }

        const args = parseToolArguments(call.function.arguments);
        if (!args) {
          trace.push({ name: call.function.name, args: call.function.arguments, ok: false, ms: Date.now() - started, reason: 'arguments JSON이 올바르지 않습니다.' });
          return cannot('Tool arguments JSON을 해석할 수 없습니다.', trace, messages);
        }

        let toolResult: ToolResult;
        try {
          const outcome = await withinDeadline(selected.run(args), deadline);
          if ('timedOut' in outcome) {
            trace.push({ name: call.function.name, args, ok: false, ms: Date.now() - started, reason: '전체 Agent 실행 시간이 초과되었습니다.' });
            return cannot('전체 Agent 실행 시간이 초과되었습니다.', trace, messages);
          }
          toolResult = outcome;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Tool 실행에 실패했습니다.';
          trace.push({ name: call.function.name, args, ok: false, ms: Date.now() - started, reason });
          return cannot(`Tool 실행 실패: ${reason}`, trace, messages);
        }

        trace.push({ name: call.function.name, args, ok: toolResult.ok, ms: Date.now() - started, reason: toolResult.reason });
        emit(options, { stage: 'tool_end', round, name: call.function.name, ok: toolResult.ok });
        messages.push(toolMessage(call, toolResult));
        if (!toolResult.ok) return cannot(`Tool 실행 실패: ${toolResult.reason ?? '사유가 없습니다.'}`, trace, messages);
        numberSources.push({ name: selected.name, result: toolResult });
      }

      if (round === MAX_TOOL_ROUNDS - 1) {
        return cannot(`Tool loop가 최대 ${MAX_TOOL_ROUNDS}회에 도달했습니다.`, trace, messages);
      }
    }
  } catch (error) {
    return cannot(error instanceof Error ? error.message : 'Agent 실행에 실패했습니다.', trace, messages);
  }
  return cannot(`Tool loop가 최대 ${MAX_TOOL_ROUNDS}회에 도달했습니다.`, trace, messages);
}

const agentTools = Object.fromEntries(
  Object.values(getAgentToolsForRole('USER')).map((tool) => [tool.name, tool]),
) as Record<string, OrchestratorTool>;
