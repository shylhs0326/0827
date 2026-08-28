export function getLoginErrorMessage(errorCode?: string) {
  if (errorCode === 'profile-unavailable') {
    return '계정 정보를 확인할 수 없습니다. 관리자에게 Supabase Data API 설정을 확인해 달라고 요청하세요.';
  }

  if (errorCode === 'inactive') {
    return '계정이 비활성화되었습니다.';
  }

  return '';
}
