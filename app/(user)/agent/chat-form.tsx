'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import EmptyValue from '@/components/ui/empty-value';
import Panel from '@/components/ui/panel';
import { submitAgent } from './actions';
import { getAnswerView, initialAgentState } from './state';

const examples = [
  '602K02693의 최근 출고 추세를 알려줘',
  'MDL121의 Sales OL과 SCM OL 정확도를 비교해줘',
  '이 품목의 수요 유형과 변동성을 설명해줘',
  'MDL121 한 대에 필요한 BOM 구성을 알려줘',
];

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button variant="primary" type="submit" disabled={disabled || pending}>{pending ? '분석 중…' : '질문 보내기'}</Button>;
}

function formatTraceArgs(args: unknown): string {
  return typeof args === 'string' ? args : JSON.stringify(args);
}

export default function ChatForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(submitAgent, initialAgentState);
  const [question, setQuestion] = useState('');
  const view = state.answer ? getAnswerView(state.answer) : null;

  return <div className="agent-workspace">
    <Panel title="AI 질문" meta="서버에서만 실행">
      {!enabled && <p className="insight-banner insight-warning"><strong>AI 연결 준비 전</strong><span>OPENAI 설정이 없어 질문 입력이 비활성화되어 있습니다.</span></p>}
      <form action={action} className="agent-form">
        <label htmlFor="agent-question">질문 <span className="muted">필수</span></label>
        <textarea id="agent-question" name="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="품목이나 기종에 대해 질문하세요." rows={4} disabled={!enabled} />
        <div className="button-row"><SubmitButton disabled={!enabled || !question.trim()} /></div>
      </form>
      <div className="agent-examples"><span className="muted">예시 질문</span>{examples.map((example) => <button key={example} type="button" className="button ghost" onClick={() => setQuestion(example)} disabled={!enabled}>{example}</button>)}</div>
    </Panel>

    {state.status === 'error' && <Panel><p className="text-critical">질문을 처리하지 못했습니다.</p><p className="muted">{state.error}</p></Panel>}
    {state.status === 'success' && state.error && <Panel><p className="muted">{state.error}</p></Panel>}

    {view?.kind === 'cannot-answer' && <Panel title={view.title}><div className="insight-banner insight-warning"><strong>계산 불가</strong><span>{view.reason}</span></div></Panel>}

    {view?.kind === 'answer' && <Panel title={view.title} meta={view.dataAsOf ? `기준시각 ${view.dataAsOf}` : '기준시각 없음'}>
      <div className="agent-answer"><p className="agent-answer-text">{view.answer}</p><Badge tone={view.verdict === 'SUPPORTED' ? 'safe' : 'warning'}>{view.verdict}</Badge></div>
      <div className="agent-answer-grid">
        <section><h4>근거</h4><div className="agent-evidence-grid">{view.evidence.length ? view.evidence.map((item, index) => <article className="agent-evidence-tile" key={`${item.source}-${index}`}><strong>{item.source}</strong><span>{item.claim}</span><b>{item.value === null ? <EmptyValue /> : String(item.value)}</b></article>) : <p className="muted">제공된 근거가 없습니다.</p>}</div></section>
        <section><h4>Risk</h4>{view.risk ? <Badge tone="warning">{view.risk}</Badge> : <EmptyValue reasonCode="RISK_UNAVAILABLE" />}</section>
        <section><h4>권고</h4><p>{view.recommendedAction ?? <EmptyValue reasonCode="RECOMMENDATION_UNAVAILABLE" />}</p></section>
      </div>
    </Panel>}

    {state.trace.length > 0 && <details className="agent-trace"><summary>Tool trace ({state.trace.length})</summary><div className="analysis-table-wrap"><table className="analysis-table"><thead><tr><th>Tool</th><th>Args</th><th>결과</th><th>ms</th><th>사유</th></tr></thead><tbody>{state.trace.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td><code>{formatTraceArgs(item.args)}</code></td><td><Badge tone={item.ok ? 'safe' : 'critical'}>{item.ok ? '정상' : '실패'}</Badge></td><td>{item.ms}</td><td>{item.reason ?? '—'}</td></tr>)}</tbody></table></div></details>}
  </div>;
}
