import test from 'node:test';
import assert from 'node:assert/strict';
import { getLoginErrorMessage, getSignInErrorMessage } from './auth-error.ts';

test('프로필 조회 인프라 오류는 비활성 계정 오류로 표시하지 않는다', () => {
  assert.equal(
    getLoginErrorMessage('profile-unavailable'),
    '계정 정보를 확인할 수 없습니다. 관리자에게 Supabase Data API 설정을 확인해 달라고 요청하세요.',
  );
});

test('실제 비활성 계정만 비활성 안내를 표시한다', () => {
  assert.equal(getLoginErrorMessage('inactive'), '계정이 비활성화되었습니다.');
});

test('로그인 실패 원인을 오류 코드와 함께 구분해 표시한다', () => {
  assert.equal(getSignInErrorMessage('invalid_credentials'), '이메일 또는 비밀번호를 확인하세요. (invalid_credentials)');
  assert.equal(getSignInErrorMessage('email_not_confirmed'), '이메일 인증이 완료되지 않았습니다. (email_not_confirmed)');
});
