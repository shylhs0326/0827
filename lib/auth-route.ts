export function isPublicAuthRoute(pathname: string) {
  return pathname === '/login' || pathname === '/api/health/supabase';
}
