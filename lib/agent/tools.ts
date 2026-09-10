import type { AppRole } from '../menu.ts';

export type AgentRole = AppRole;

export type ToolResult<T = unknown> = {
  ok: boolean;
  data: T | null;
  numbers: Record<string, number>;
  dataAsOf: string | null;
  reason: string | null;
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type AgentTool<TArgs extends Record<string, unknown> = any> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  roles: readonly AgentRole[];
  run: (args: TArgs) => Promise<ToolResult>;
};

const emptyResult = (reason: string): ToolResult => ({
  ok: false,
  data: null,
  numbers: {},
  dataAsOf: null,
  reason,
});

function collectNumbers(value: unknown, path: string, result: Record<string, number>) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    result[path] = value;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectNumbers(entry, `${path}[${index}]`, result));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      collectNumbers(entry, path ? `${path}.${key}` : key, result);
    });
  }
}

export function toToolResult<T>(source: ToolResult<T>): ToolResult<T> {
  const numbers: Record<string, number> = {};
  collectNumbers(source.data, '', numbers);
  return { ...source, numbers };
}

function fromRows<T>(rows: T[], error: string | null): ToolResult<T[]> {
  if (error) return { ...emptyResult(error), data: null };
  if (rows.length === 0) return { ...emptyResult('조회 결과가 없습니다.'), data: null };

  const first = rows[0] as Record<string, unknown>;
  const dataAsOf = typeof first.dataAsOf === 'string' ? first.dataAsOf : null;
  const reason = typeof first.reasonCode === 'string' ? first.reasonCode : null;
  return toToolResult({ ok: true, data: rows, numbers: {}, dataAsOf, reason });
}

const itemParameters = (description: string): JsonSchema => ({
  type: 'object',
  properties: { itemCode: { type: 'string', description } },
  required: ['itemCode'],
  additionalProperties: false,
});

const modelParameters: JsonSchema = {
  type: 'object',
  properties: { modelBase: { type: 'string', description: '기종 기준값' } },
  required: ['modelBase'],
  additionalProperties: false,
};

const olParameters: JsonSchema = {
  type: 'object',
  properties: {
    modelBase: { type: 'string', description: '기종 기준값' },
    fy: { type: ['string', 'null'], description: '회계연도. 없으면 null' },
  },
  required: ['modelBase', 'fy'],
  additionalProperties: false,
};

export const agentTools = {
  getShipmentTrend: {
    name: 'getShipmentTrend',
    description: '품목의 월별 출고량과 3개월, 6개월, 12개월 평균을 조회합니다.',
    parameters: itemParameters('품목 코드'),
    roles: ['USER', 'ADMIN'] as const,
    async run(args: { itemCode: string }) {
      if (!args?.itemCode?.trim()) return emptyResult('품목 코드가 필요합니다.');
      const { getShipmentTrend } = await import('../scm.ts');
      const result = await getShipmentTrend(args.itemCode.trim());
      return fromRows(result.rows, result.error);
    },
  },
  getDemandProfile: {
    name: 'getDemandProfile',
    description: '품목의 ADI, CV², 무수요율과 수요 유형을 조회합니다.',
    parameters: itemParameters('품목 코드'),
    roles: ['USER', 'ADMIN'] as const,
    async run(args: { itemCode: string }) {
      if (!args?.itemCode?.trim()) return emptyResult('품목 코드가 필요합니다.');
      const { getDemandProfile } = await import('../scm.ts');
      const result = await getDemandProfile(args.itemCode.trim());
      return fromRows(result.rows, result.error);
    },
  },
  getOlAccuracy: {
    name: 'getOlAccuracy',
    description: '기종의 Sales OL과 SCM OL WAPE 및 Bias를 조회합니다.',
    parameters: olParameters,
    roles: ['USER', 'ADMIN'] as const,
    async run(args: { modelBase: string; fy: string | null }) {
      if (!args?.modelBase?.trim()) return emptyResult('기종 기준값이 필요합니다.');
      const { getOlAccuracy } = await import('../scm.ts');
      const result = await getOlAccuracy(args.modelBase.trim(), args.fy?.trim() || undefined);
      return fromRows(result.rows, result.error);
    },
  },
  getBomRequirement: {
    name: 'getBomRequirement',
    description: '기종 한 대 판매에 필요한 CAP, 필수 옵션, SCC/Label과 구성 품목을 조회합니다.',
    parameters: modelParameters,
    roles: ['USER', 'ADMIN'] as const,
    async run(args: { modelBase: string }) {
      if (!args?.modelBase?.trim()) return emptyResult('기종 기준값이 필요합니다.');
      const { getBomRequirement } = await import('../scm.ts');
      const result = await getBomRequirement(args.modelBase.trim());
      return fromRows(result.rows, result.error);
    },
  },
} satisfies Record<string, AgentTool<any>>;

export function getAgentToolsForRole(role: string): AgentTool[] {
  return Object.values(agentTools).filter((tool) => tool.roles.includes(role as AgentRole));
}
