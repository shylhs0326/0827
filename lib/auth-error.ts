export function getLoginErrorMessage(errorCode?: string) {
  if (errorCode === 'profile-unavailable') {
    return '계정 정보를 확인할 수 없습니다. 관리자에게 Supabase Data API 설정을 확인해 달라고 요청하세요.';
  }

  if (errorCode === 'inactive') {
    return '계정이 비활성화되었습니다.';
  }

  return '';
}

export function getSignInErrorMessage(errorCode?: string) {
  if (errorCode === 'invalid_credentials') {
    return '이메일 또는 비밀번호를 확인하세요. (invalid_credentials)';
  }

  if (errorCode === 'email_not_confirmed') {
    return '이메일 인증이 완료되지 않았습니다. (email_not_confirmed)';
  }

  return `로그인에 실패했습니다. (${errorCode ?? 'unknown_error'})`;
}
