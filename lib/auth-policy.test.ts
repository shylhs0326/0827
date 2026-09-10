import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeRole, canChangeActive, getDefaultRouteForRole, routeAccessDecision, safeNextPath } from './auth-policy.ts';

test('관리자는 자신의 관리자 role을 USER로 낮출 수 없다', () => {
  assert.equal(canChangeRole({ actorId: 'u1', targetId: 'u1', nextRole: 'USER' }), false);
  assert.equal(canChangeRole({ actorId: 'u1', targetId: 'u1', nextRole: 'ADMIN' }), true);
});

test('관리자는 자신의 계정을 비활성화할 수 없다', () => {
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u1', nextActive: false }), false);
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u1', nextActive: true }), true);
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u2', nextActive: false }), true);
});

test('관리자는 기본 진입 시 관리자 화면으로 이동한다', () => {
  assert.equal(getDefaultRouteForRole('ADMIN'), '/admin');
  assert.equal(getDefaultRouteForRole('USER'), '/dashboard');
});

test('외부 next 경로와 비활성 사용자 접근을 차단한다', () => {
  assert.equal(safeNextPath('https://example.com'), '/dashboard');
  assert.equal(safeNextPath('/agent'), '/agent');
  assert.deepEqual(routeAccessDecision({ pathname: '/dashboard', authenticated: true, active: false, role: 'USER' }), { kind: 'FORBIDDEN' });
  assert.deepEqual(routeAccessDecision({ pathname: '/admin/users', authenticated: true, active: true, role: 'USER' }), { kind: 'FORBIDDEN' });
});
