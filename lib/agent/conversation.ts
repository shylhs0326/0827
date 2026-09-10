import type { AgentAnswer } from './schema';
import type { AgentTrace } from './orchestrator';

export type ConversationSummary = {
  id: string;
  userId: string;
  userEmail: string;
  title: string;
  startedAt: string;
  lastAt: string;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  answer: AgentAnswer | null;
  toolTrace: AgentTrace[] | null;
  usage: Record<string, unknown> | null;
  guardrail: Record<string, unknown> | null;
  createdAt: string;
};

export type SaveTurnInput = {
  title: string;
  question: string;
  answer: AgentAnswer;
  toolTrace: AgentTrace[];
  usage?: Record<string, unknown> | null;
  guardrail?: Record<string, unknown> | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function toConversationSummary(row: Record<string, unknown>): ConversationSummary {
  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    userEmail: String(row.user_email ?? ''),
    title: String(row.title ?? ''),
    startedAt: String(row.started_at ?? ''),
    lastAt: String(row.last_at ?? ''),
  };
}

export function toStoredMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id ?? ''),
    conversationId: String(row.conversation_id ?? ''),
    role: String(row.role ?? ''),
    content: String(row.content ?? ''),
    answer: record(row.answer) as AgentAnswer | null,
    toolTrace: Array.isArray(row.tool_trace) ? row.tool_trace as AgentTrace[] : null,
    usage: record(row.usage),
    guardrail: record(row.guardrail),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function listConversations(): Promise<{ rows: ConversationSummary[]; error: string | null }> {
  try {
    const { requireUser } = await import('@/lib/auth');
    const { supabase } = await requireUser();
    const { data, error } = await supabase.schema('core').from('agent_conversation').select('*').order('last_at', { ascending: false });
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => toConversationSummary(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : '대화 목록을 조회할 수 없습니다.' };
  }
}

export async function getConversationMessages(conversationId: string): Promise<{ rows: StoredMessage[]; error: string | null }> {
  try {
    if (!conversationId.trim()) return { rows: [], error: '대화 ID가 필요합니다.' };
    const { requireUser } = await import('@/lib/auth');
    const { supabase } = await requireUser();
    const { data, error } = await supabase.schema('core').from('agent_message').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []).map((row) => toStoredMessage(row as Record<string, unknown>)), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : '대화 메시지를 조회할 수 없습니다.' };
  }
}

export async function saveTurn(input: SaveTurnInput): Promise<{ conversationId: string | null; error: string | null }> {
  try {
    const { requireUser } = await import('@/lib/auth');
    const { supabase } = await requireUser();
    const { data, error } = await supabase.schema('core').rpc('save_agent_turn', {
      p_title: input.title,
      p_question: input.question,
      p_answer: input.answer,
      p_tool_trace: input.toolTrace,
      p_usage: input.usage ?? null,
      p_guardrail: input.guardrail ?? null,
    });
    if (error) return { conversationId: null, error: error.message };
    return { conversationId: typeof data === 'string' ? data : null, error: null };
  } catch (error) {
    return { conversationId: null, error: error instanceof Error ? error.message : '대화 저장에 실패했습니다.' };
  }
}
