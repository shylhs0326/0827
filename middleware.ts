import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { routeAccessDecision } from '@/lib/auth-policy';

export async function middleware(request: NextRequest) {
  const protectedPrefixes = ['/dashboard', '/analysis', '/agent', '/admin', '/workflow'];
  const pathname = request.nextUrl.pathname;
  if (!protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.next();
  let response = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) return new NextResponse('Supabase 환경변수가 필요합니다.', { status: 503 });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  const { data: profile } = await supabase.schema('core').from('app_user').select('role, active').eq('user_id', user.id).maybeSingle();
  const access = routeAccessDecision({ pathname, authenticated: true, active: profile?.active === true, role: profile?.role === 'ADMIN' ? 'ADMIN' : profile?.role === 'USER' ? 'USER' : null });
  if (access.kind === 'FORBIDDEN') return new NextResponse('이 경로에 접근할 권한이 없습니다.', { status: 403 });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
