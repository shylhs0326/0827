export type AgentEvidenceValue = string | number | boolean | null;

export type AgentEvidence = {
  source: string;
  claim: string;
  value: AgentEvidenceValue;
};

export type AgentVerdict = 'SUPPORTED' | 'PARTIAL' | 'CANNOT_ANSWER';

export type AgentAnswer = {
  answer: string;
  verdict: AgentVerdict;
  evidence: AgentEvidence[];
  data_as_of: string | null;
  risk: string | null;
  recommended_action: string | null;
  cannot_answer: boolean;
  cannot_answer_reason: string | null;
};

const agentEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    claim: { type: 'string' },
    value: { type: ['string', 'number', 'boolean', 'null'] },
  },
  required: ['source', 'claim', 'value'],
} as const;

export const agentAnswerJsonSchema = {
  name: 'agent_answer',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      verdict: { type: 'string', enum: ['SUPPORTED', 'PARTIAL', 'CANNOT_ANSWER'] },
      evidence: { type: 'array', items: agentEvidenceSchema },
      data_as_of: { type: ['string', 'null'] },
      risk: { type: ['string', 'null'] },
      recommended_action: { type: ['string', 'null'] },
      cannot_answer: { type: 'boolean' },
      cannot_answer_reason: { type: ['string', 'null'] },
    },
    required: [
      'answer',
      'verdict',
      'evidence',
      'data_as_of',
      'risk',
      'recommended_action',
      'cannot_answer',
      'cannot_answer_reason',
    ],
  },
} as const;

export const agentAnswerSchema = agentAnswerJsonSchema.schema;

const answerFields = [
  'answer',
  'verdict',
  'evidence',
  'data_as_of',
  'risk',
  'recommended_action',
  'cannot_answer',
  'cannot_answer_reason',
] as const;

const evidenceFields = ['source', 'claim', 'value'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactFields(value: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    if (!(field in value)) throw new Error(`필수 필드가 없습니다: ${field}`);
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) throw new Error(`허용되지 않은 필드입니다: ${field}`);
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEvidenceValue(value: unknown): value is AgentEvidenceValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function parseObject(value: unknown): AgentAnswer {
  if (!isRecord(value)) throw new Error('응답은 JSON 객체여야 합니다.');
  assertExactFields(value, answerFields);

  if (typeof value.answer !== 'string') throw new Error('answer는 문자열이어야 합니다.');
  if (value.verdict !== 'SUPPORTED' && value.verdict !== 'PARTIAL' && value.verdict !== 'CANNOT_ANSWER') {
    throw new Error('verdict 값이 올바르지 않습니다.');
  }
  if (!Array.isArray(value.evidence)) throw new Error('evidence는 배열이어야 합니다.');

  const evidence = value.evidence.map((item, index) => {
    if (!isRecord(item)) throw new Error(`evidence[${index}]는 객체여야 합니다.`);
    assertExactFields(item, evidenceFields);
    if (typeof item.source !== 'string') throw new Error(`evidence[${index}].source는 문자열이어야 합니다.`);
    if (typeof item.claim !== 'string') throw new Error(`evidence[${index}].claim은 문자열이어야 합니다.`);
    if (!isEvidenceValue(item.value)) throw new Error(`evidence[${index}].value 형식이 올바르지 않습니다.`);
    return { source: item.source, claim: item.claim, value: item.value };
  });

  if (!isNullableString(value.data_as_of)) throw new Error('data_as_of는 문자열 또는 null이어야 합니다.');
  if (!isNullableString(value.risk)) throw new Error('risk는 문자열 또는 null이어야 합니다.');
  if (!isNullableString(value.recommended_action)) throw new Error('recommended_action은 문자열 또는 null이어야 합니다.');
  if (typeof value.cannot_answer !== 'boolean') throw new Error('cannot_answer는 boolean이어야 합니다.');
  if (!isNullableString(value.cannot_answer_reason)) {
    throw new Error('cannot_answer_reason은 문자열 또는 null이어야 합니다.');
  }

  if (value.cannot_answer && value.verdict !== 'CANNOT_ANSWER') {
    throw new Error('cannot_answer가 true이면 verdict는 CANNOT_ANSWER여야 합니다.');
  }
  if (value.cannot_answer && !value.cannot_answer_reason?.trim()) {
    throw new Error('cannot_answer가 true이면 cannot_answer_reason이 필요합니다.');
  }
  if (!value.cannot_answer && value.verdict === 'CANNOT_ANSWER') {
    throw new Error('cannot_answer가 false이면 verdict는 CANNOT_ANSWER일 수 없습니다.');
  }
  if (!value.cannot_answer && value.cannot_answer_reason !== null) {
    throw new Error('cannot_answer가 false이면 cannot_answer_reason은 null이어야 합니다.');
  }

  return {
    answer: value.answer,
    verdict: value.verdict,
    evidence,
    data_as_of: value.data_as_of,
    risk: value.risk,
    recommended_action: value.recommended_action,
    cannot_answer: value.cannot_answer,
    cannot_answer_reason: value.cannot_answer_reason,
  };
}

export function parseAgentAnswer(input: string | unknown): AgentAnswer {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new Error('JSON 형식이 올바르지 않습니다.');
    }
  }
  return parseObject(value);
}

export function cannotAnswer(reason: string): AgentAnswer {
  if (!reason.trim()) throw new Error('계산 불가 사유가 필요합니다.');
  return {
    answer: '현재 질문에 답할 수 없습니다.',
    verdict: 'CANNOT_ANSWER',
    evidence: [],
    data_as_of: null,
    risk: null,
    recommended_action: null,
    cannot_answer: true,
    cannot_answer_reason: reason,
  };
}
