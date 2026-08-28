import test from 'node:test';
import assert from 'node:assert/strict';
import { getLoginErrorMessage } from './auth-error.ts';

test('프로필 조회 인프라 오류는 비활성 계정 오류로 표시하지 않는다', () => {
  assert.equal(
    getLoginErrorMessage('profile-unavailable'),
    '계정 정보를 확인할 수 없습니다. 관리자에게 Supabase Data API 설정을 확인해 달라고 요청하세요.',
  );
});

test('실제 비활성 계정만 비활성 안내를 표시한다', () => {
  assert.equal(getLoginErrorMessage('inactive'), '계정이 비활성화되었습니다.');
});
