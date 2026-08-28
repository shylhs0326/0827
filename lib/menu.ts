export type MenuItem = { href: string; label: string; description?: string; icon?: string };

export const userMenu: MenuItem[] = [
  { href: '/workflow', label: '월간 발주계획', description: '월간 업무 흐름' },
  { href: '/analysis/leadtime', label: '리드타임 격차', description: '공급처별 실적 비교' },
  { href: '/analysis/stockout', label: '재고 소진 위험', description: '품목별 위험 확인' },
];

export const adminMenu: MenuItem[] = [
  { href: '/admin', label: '관리자 홈', description: '시스템 관리' },
  { href: '/admin/master', label: '마스터 관리', description: '기준 데이터 관리' },
];

export const menu = { user: userMenu, admin: adminMenu };
