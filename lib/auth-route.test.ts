import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAuthRoute } from './auth-route.ts';

test('로그인과 상태 진단 경로는 인증 없이 접근할 수 있다', () => {
  assert.equal(isPublicAuthRoute('/login'), true);
  assert.equal(isPublicAuthRoute('/api/health/supabase'), true);
});

test('업무 및 관리자 경로는 인증이 필요하다', () => {
  assert.equal(isPublicAuthRoute('/workflow'), false);
  assert.equal(isPublicAuthRoute('/admin/users'), false);
});
