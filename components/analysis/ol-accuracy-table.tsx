'use client';

import { useMemo, useState } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyValue from '@/components/ui/empty-value';
import type { OlAccuracy } from '@/lib/scm-model';

function pct(value: number | null, reason: string | null) { return value === null ? <EmptyValue reasonCode={reason ?? 'CALCULATION_UNAVAILABLE'} /> : `${(value * 100).toFixed(1)}%`; }
function bias(value: number | null, reason: string | null) { if (value === null) return <EmptyValue reasonCode={reason ?? 'CALCULATION_UNAVAILABLE'} />; return <span className={value > 0 ? 'text-danger' : 'text-good'}>{value > 0 ? '+' : ''}{(value * 100).toFixed(1)}%</span>; }
const columns: Column<OlAccuracy>[] = [
  { key: 'fySheet', label: '회계연도' }, { key: 'modelBase', label: '기종' },
  { key: 'totalAct', label: '실적 합', align: 'right', render: (row) => row.totalAct === null ? <EmptyValue reasonCode={row.reasonCode ?? 'NO_ACTUAL'} /> : row.totalAct.toLocaleString('ko-KR') },
  { key: 'salesWape', label: '영업 WAPE', align: 'right', render: (row) => pct(row.salesWape, row.reasonCode) },
  { key: 'scmWape', label: 'SCM WAPE', align: 'right', render: (row) => pct(row.scmWape, row.reasonCode) },
  { key: 'salesBias', label: '영업 Bias', align: 'right', render: (row) => bias(row.salesBias, row.reasonCode) },
  { key: 'scmBias', label: 'SCM Bias', align: 'right', render: (row) => bias(row.scmBias, row.reasonCode) },
  { key: 'scoredSales', label: '채점 행수', align: 'right', render: (row) => `영업 ${row.scoredSales ?? 0} · SCM ${row.scoredScm ?? 0}` },
];

export default function OlAccuracyTable({ rows }: { rows: OlAccuracy[] }) {
  const [search, setSearch] = useState('');
  const [fy, setFy] = useState('ALL');
  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.fySheet).filter((year): year is string => typeof year === 'string'))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => (!search.trim() || row.modelBase?.toLowerCase().includes(search.trim().toLowerCase())) && (fy === 'ALL' || row.fySheet === fy) && row.source === 'MODEL'), [fy, rows, search]);
  return <section className="section card"><div className="card-title"><div><h3>기종별 OL 정확도</h3><span>WAPE는 작을수록 정확하고 Bias 양수는 과대예측입니다.</span></div><span className="muted">{filtered.length.toLocaleString('ko-KR')}건</span></div><div className="button-row"><input className="form-input" aria-label="기종 검색" placeholder="기종 검색" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="table-select" aria-label="회계연도 필터" value={fy} onChange={(event) => setFy(event.target.value)}><option value="ALL">전체 회계연도</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div><DataTable columns={columns} rows={filtered} rowKey={(row, index) => `${row.fySheet}-${row.modelBase}-${index}`} empty="조건에 맞는 기종이 없습니다." /></section>;
}
