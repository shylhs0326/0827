import LoginForm from '@/components/auth/login-form';
import { safeNextPath } from '@/lib/auth-policy';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) { const params = await searchParams; return <main className="auth-page"><section className="card"><span className="eyebrow">SCM CONTROL CENTER</span><h1>로그인</h1><p className="muted">월간 발주계획 시스템에 로그인하세요.</p><LoginForm nextPath={safeNextPath(params.next)} initialError={params.error} /></section></main>; }
