'use client';

import { useMemo, useState } from 'react';
import Badge from '@/components/ui/badge';
import DataTable, { formatNumber, type Column } from '@/components/ui/data-table';
import EmptyValue from '@/components/ui/empty-value';
import type { ItemDemandProfile } from '@/lib/scm-model';

const typeTone: Record<NonNullable<ItemDemandProfile['demandType']>, 'safe' | 'warning' | 'critical'> = {
  SMOOTH: 'safe', INTERMITTENT: 'warning', ERRATIC: 'warning', LUMPY: 'critical',
};

function numberCell(value: number | null, reason: string | null, suffix = '') {
  return value === null ? <EmptyValue reasonCode={reason ?? 'CALCULATION_UNAVAILABLE'} /> : formatNumber(value, suffix);
}

const columns: Column<ItemDemandProfile>[] = [
  { key: 'itemCode', label: '품목', render: (row) => <><b>{row.itemCode}</b><br /><span className="muted">{row.description}</span></> },
  { key: 'itemType', label: '구분', render: (row) => row.itemType ?? <EmptyValue /> },
  { key: 'lastYm', label: '관측 기간', render: (row) => <span className="muted">{row.firstYm ?? '—'} ~ {row.lastYm ?? '—'} ({row.nPeriods}개월 중 {row.nNonzero}개월)</span> },
  { key: 'adi', label: 'ADI', align: 'right', render: (row) => numberCell(row.adi, row.reasonCode) },
  { key: 'cvSquared', label: 'CV²', align: 'right', render: (row) => numberCell(row.cvSquared, row.reasonCode) },
  { key: 'zeroDemandRate', label: '무수요율', align: 'right', render: (row) => numberCell(row.zeroDemandRate, row.reasonCode) },
  { key: 'meanNonzeroQty', label: '평균 출고량', align: 'right', render: (row) => numberCell(row.meanNonzeroQty, row.reasonCode, ' EA') },
  { key: 'demandType', label: '수요 유형', render: (row) => row.demandType ? <Badge tone={typeTone[row.demandType]}>{row.demandType}</Badge> : <EmptyValue reasonCode={row.reasonCode} /> },
  { key: 'reasonCode', label: '사유', render: (row) => row.reasonCode ?? <span className="muted">—</span> },
];

export default function DemandProfileTable({ rows }: { rows: ItemDemandProfile[] }) {
  const [search, setSearch] = useState('');
  const [demandType, setDemandType] = useState('ALL');
  const filtered = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || row.itemCode.toLowerCase().includes(query) || row.description.toLowerCase().includes(query))
      && (demandType === 'ALL' || row.demandType === demandType);
  }), [demandType, rows, search]);

  return <section className="section card">
    <div className="card-title"><div><h3>품목별 수요 성격</h3><span>Syntetos–Boylan 분류. 관측 6개월 미만은 유형을 추정하지 않습니다.</span></div><span className="muted">{filtered.length.toLocaleString('ko-KR')}건</span></div>
    <div className="button-row"><input className="form-input" aria-label="품목 검색" placeholder="품목코드 또는 품명 검색" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="table-select" aria-label="수요 유형 필터" value={demandType} onChange={(event) => setDemandType(event.target.value)}><option value="ALL">전체 수요 유형</option><option value="SMOOTH">SMOOTH</option><option value="INTERMITTENT">INTERMITTENT</option><option value="ERRATIC">ERRATIC</option><option value="LUMPY">LUMPY</option></select></div>
    <DataTable columns={columns} rows={filtered} rowKey={(row) => row.itemCode} empty="조건에 맞는 품목이 없습니다." />
  </section>;
}
