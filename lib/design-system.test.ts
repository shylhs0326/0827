import test from 'node:test';
import assert from 'node:assert/strict';
import { getStatusTone, formatEmptyValue } from './design-system.ts';

test('계산 불가 값은 reason code와 함께 표시한다', () => {
  assert.equal(formatEmptyValue('NO_USAGE'), '— + NO_USAGE');
});

test('표준 상태를 화면용 tone으로 매핑한다', () => {
  assert.equal(getStatusTone('SAFE'), 'safe');
  assert.equal(getStatusTone('WARNING'), 'warning');
  assert.equal(getStatusTone('CRITICAL'), 'critical');
  assert.equal(getStatusTone('CALCULATION_UNAVAILABLE'), 'calculation-unavailable');
});
