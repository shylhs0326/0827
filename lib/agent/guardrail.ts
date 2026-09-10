import type { AgentAnswer } from './schema.ts';
import type { ToolResult } from './tools.ts';

export type ToolNumberSource = {
  name: string;
  result: Pick<ToolResult, 'numbers'>;
};

export type NumberCheckResult = {
  ok: boolean;
  unverified: number[];
};

type ExtractedNumber = {
  value: number;
  percent: boolean;
  decimals: number;
};

const numberPattern = /[-+]?\d[\d,]*(?:\.\d+)?%?/g;

export function buildAllowedNumbers(sources: ToolNumberSource[]): Record<string, number> {
  const allowed: Record<string, number> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source.result.numbers)) {
      if (typeof value === 'number' && Number.isFinite(value)) allowed[`${source.name}.${key}`] = value;
    }
  }
  return allowed;
}

function isExcluded(text: string, start: number, end: number, raw: string): boolean {
  const before = text.slice(Math.max(0, start - 1), start);
  const after = text.slice(end, end + 1);
  const around = text.slice(Math.max(0, start - 6), Math.min(text.length, end + 6));
  if (/^\d{4}-\d{1,2}$/.test(around.replace(/[^\d-]/g, ''))) return true;
  if (/\d{4}-\d{1,2}/.test(around)) return true;
  if (/[A-Za-z]$/.test(before) || /^[A-Za-z]/.test(after)) return true;
  if (after === '.' && /^\s*$/.test(text.slice(end + 1, end + 2))) return true;
  if (raw.replace(/[,\-+]/g, '').length === 4 && /[-/]$/.test(after)) return true;
  return false;
}

function extractFromText(text: string): ExtractedNumber[] {
  const values: ExtractedNumber[] = [];
  numberPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = numberPattern.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;
    if (isExcluded(text, start, end, raw)) continue;
    const percent = raw.endsWith('%');
    const numeric = Number(raw.replace(/[%+,]/g, ''));
    if (!Number.isFinite(numeric)) continue;
    const decimals = (raw.replace('%', '').split('.')[1] ?? '').length;
    values.push({ value: percent ? numeric / 100 : numeric, percent, decimals });
  }
  return values;
}

function selectedAnswerValues(answer: AgentAnswer): unknown[] {
  return [
    answer.answer,
    answer.verdict,
    answer.evidence,
    answer.recommended_action,
    answer.cannot_answer_reason,
  ];
}

function extractValues(value: unknown): ExtractedNumber[] {
  if (typeof value === 'string') return extractFromText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return [{ value, percent: false, decimals: 12 }];
  if (Array.isArray(value)) return value.flatMap(extractValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(extractValues);
  return [];
}

export function extractAnswerNumbers(answer: AgentAnswer): number[] {
  return selectedAnswerValues(answer).flatMap(extractValues).map((item) => item.value);
}

function matchesAllowed(candidate: ExtractedNumber, allowed: number[]): boolean {
  return allowed.some((value) => {
    if (candidate.percent && (value < 0 || value > 1)) return false;
    const precision = candidate.percent ? candidate.decimals + 2 : candidate.decimals;
    const tolerance = candidate.decimals >= 12 ? 1e-9 : 0.5 * 10 ** -precision + 1e-9;
    return Math.abs(candidate.value - value) <= tolerance;
  });
}

export function validateAnswerNumbers(answer: AgentAnswer, allowedNumbers: Record<string, number>): NumberCheckResult {
  const allowed = Object.values(allowedNumbers).filter((value) => typeof value === 'number' && Number.isFinite(value));
  const unverified = extractValues(selectedAnswerValues(answer))
    .filter((candidate) => !matchesAllowed(candidate, allowed))
    .map((candidate) => candidate.value);
  return { ok: unverified.length === 0, unverified };
}
