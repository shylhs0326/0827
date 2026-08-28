// 서버 컴포넌트에서 쓰는 Supabase 클라이언트입니다.
//
// 조회 함수(lib/scm.ts)가 이 클라이언트를 씁니다.
// 세션을 쓰지 않는 읽기 전용 조회라 세션 유지 설정을 꺼둡니다.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabaseEnv } from './env';

export async function createSupabaseServerClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }>) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Component에서는 middleware가 갱신합니다. */ }
      },
    },
  });
}
