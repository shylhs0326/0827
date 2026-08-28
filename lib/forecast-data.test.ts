import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getForecastDataset } from './forecast-data.ts';

test('Forecast 학습 데이터는 train 전용 view를 사용한다', () => {
  assert.deepEqual(getForecastDataset('train'), { schema: 'core', relation: 'v_train_demand' });
});

test('Backtest actual은 test 전용 view를 사용한다', () => {
  assert.deepEqual(getForecastDataset('test'), { schema: 'core', relation: 'v_test_actual' });
});

test('Forecast source 계약은 raw usage history를 직접 참조하지 않는다', () => {
  const source = readFileSync(new URL('./forecast-data.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /raw\.usage_history/);
  assert.match(source, /v_train_demand/);
  assert.match(source, /v_test_actual/);
});
