import LoginForm from '@/components/auth/login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) { const params = await searchParams; const nextPath = params.next?.startsWith('/') ? params.next : '/'; return <main className="auth-page"><section className="card"><span className="eyebrow">SCM CONTROL CENTER</span><h1>로그인</h1><p className="muted">월간 발주계획 시스템에 로그인하세요.</p><LoginForm nextPath={nextPath} initialError={params.error} /></section></main>; }
