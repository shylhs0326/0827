export type ForecastDatasetKind = 'train' | 'test';

export function getForecastDataset(kind: ForecastDatasetKind) {
  return kind === 'train'
    ? { schema: 'core' as const, relation: 'v_train_demand' as const }
    : { schema: 'core' as const, relation: 'v_test_actual' as const };
}
