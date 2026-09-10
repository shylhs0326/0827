export type AppRole = 'ADMIN' | 'USER';

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export function canChangeRole({ actorId, targetId, nextRole }: { actorId: string; targetId: string; nextRole: AppRole }) {
  return actorId !== targetId || nextRole === 'ADMIN';
}

export function canChangeActive({ actorId, targetId, nextActive }: { actorId: string; targetId: string; nextActive: boolean }) {
  return actorId !== targetId || nextActive;
}

export function getDefaultRouteForRole(role: AppRole) {
  return role === 'ADMIN' ? '/admin' : '/dashboard';
}

export type RouteAccessDecision = { kind: 'ALLOW' } | { kind: 'LOGIN_REQUIRED' } | { kind: 'FORBIDDEN' };

export function routeAccessDecision({ pathname, authenticated, active, role }: { pathname: string; authenticated: boolean; active: boolean; role: AppRole | null }): RouteAccessDecision {
  if (!authenticated) return { kind: 'LOGIN_REQUIRED' };
  if (!active) return { kind: 'FORBIDDEN' };
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return role === 'ADMIN' ? { kind: 'ALLOW' } : { kind: 'FORBIDDEN' };
  return { kind: 'ALLOW' };
}
