import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from './auth-policy';

export type AppUser = { user_id: string; email: string; name: string; department: string; role: AppRole; active: boolean; last_login_at: string | null };

export async function getRole(): Promise<AppRole | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.schema('core').from('app_user').select('role, active').eq('user_id', user.id).maybeSingle();
  if (!data?.active) return null;
  return data.role as AppRole;
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await supabase.schema('core').from('app_user').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !profile || !profile.active) redirect('/login?error=inactive');
  return { supabase, user, profile: profile as AppUser };
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result.profile.role !== 'ADMIN') {
    const { forbidden } = await import('next/navigation');
    forbidden();
  }
  return result;
}
