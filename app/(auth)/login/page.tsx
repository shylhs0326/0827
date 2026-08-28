import Link from 'next/link';

export default function LoginPage() { return <main className="auth-page"><section className="card"><span className="eyebrow">SCM CONTROL CENTER</span><h1>로그인</h1><p className="muted">인증 기능은 다음 단계에서 연결됩니다.</p><Link className="button primary" href="/">발주계획으로 이동</Link></section></main>; }
