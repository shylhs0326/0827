import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeRole, canChangeActive } from './auth-policy.ts';

test('관리자는 자신의 관리자 role을 USER로 낮출 수 없다', () => {
  assert.equal(canChangeRole({ actorId: 'u1', targetId: 'u1', nextRole: 'USER' }), false);
  assert.equal(canChangeRole({ actorId: 'u1', targetId: 'u1', nextRole: 'ADMIN' }), true);
});

test('관리자는 자신의 계정을 비활성화할 수 없다', () => {
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u1', nextActive: false }), false);
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u1', nextActive: true }), true);
  assert.equal(canChangeActive({ actorId: 'u1', targetId: 'u2', nextActive: false }), true);
});
