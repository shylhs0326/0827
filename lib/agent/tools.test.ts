import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentTools,
  getAgentToolsForRole,
  type AgentTool,
  type ToolResult,
  toToolResult,
} from './tools.ts';

test('registers four uniquely named tools with strict parameter schemas', () => {
  const tools = Object.values(agentTools);
  const names = tools.map((tool) => tool.name);

  assert.equal(tools.length, 4);
  assert.equal(new Set(names).size, names.length);
  for (const tool of tools) {
    assert.ok(tool.description.length > 0);
    assert.equal(tool.parameters.type, 'object');
    assert.equal(tool.parameters.additionalProperties, false);
    assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties));
    assert.ok(tool.roles.length > 0);
    assert.equal(typeof tool.run, 'function');
  }
});

test('filters tools by declared agent role', () => {
  assert.equal(getAgentToolsForRole('USER').length, 4);
  assert.equal(getAgentToolsForRole('ADMIN').length, 4);
  assert.equal(getAgentToolsForRole('unknown').length, 0);
});

test('returns a reason instead of querying when a required item is missing', async () => {
  const result = await agentTools.getShipmentTrend.run({ itemCode: '' });

  assert.deepEqual(result, {
    ok: false,
    data: null,
    numbers: {},
    dataAsOf: null,
    reason: '품목 코드가 필요합니다.',
  });
});

test('returns a reason instead of querying when a required model is missing', async () => {
  const result = await agentTools.getBomRequirement.run({ modelBase: '' });

  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(result.dataAsOf, null);
  assert.equal(result.reason, '기종 기준값이 필요합니다.');
});

test('keeps null values and collects every numeric value in ToolResult', () => {
  const source: ToolResult = {
    ok: true,
    data: { latestQty: 1049, avg3m: null, nested: [{ value: 3 }] },
    numbers: {},
    dataAsOf: '2026-07',
    reason: null,
  };

  assert.deepEqual(toToolResult(source), {
    ...source,
    numbers: { latestQty: 1049, 'nested[0].value': 3 },
  });
});
