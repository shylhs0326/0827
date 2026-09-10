import type { LucideIcon } from 'lucide-react';
import { BarChart3, Boxes, Database, Gauge, LineChart, Settings2, Users, Workflow, Bot } from 'lucide-react';

export type AppRole = 'ADMIN' | 'USER';
export type MenuItem = { href: string; label: string; description?: string; icon?: LucideIcon };

export const USER_MENU: MenuItem[] = [
  { href: '/dashboard', label: '전체 현황', description: '월간 발주계획 요약', icon: Gauge },
  { href: '/analysis/demand-profile', label: '수요 패턴', description: '출고 실적 기반 수요 성격 분류', icon: BarChart3 },
  { href: '/analysis/model-comparison', label: 'OL 예측 정확도', description: '영업 OL · SCM OL WAPE와 Bias', icon: LineChart },
  { href: '/workflow', label: '월간 발주계획', description: '월간 업무 흐름', icon: Workflow },
  { href: '/analysis/leadtime', label: '리드타임 격차', description: '공급처별 실적 비교', icon: LineChart },
  { href: '/analysis/stockout', label: '재고 소진 위험', description: '품목별 위험 확인', icon: Boxes },
  { href: '/agent', label: 'AI 운영 어시스턴트', description: '근거 기반 SCM 질문', icon: Bot },
];

export const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: '관리자 홈', description: '시스템 관리', icon: Settings2 },
  { href: '/admin/users', label: '사용자 관리', description: '계정·권한 관리', icon: Users },
  { href: '/admin/master', label: '마스터 관리', description: '기준 데이터 관리', icon: Database },
  { href: '/admin/data-management', label: '데이터 관리', description: '파일 적재·검증 이력', icon: Database },
  { href: '/admin/demand', label: '수요 관리', description: '수요 데이터 관리', icon: BarChart3 },
  { href: '/admin/forecast-models', label: 'Forecast Models', description: '예측 모델 설정', icon: Bot },
  { href: '/admin/forecast-runs', label: 'Forecast Runs', description: '예측 실행 이력', icon: Bot },
  { href: '/admin/backtest-runs', label: 'Backtest Runs', description: '검증 실행 이력', icon: LineChart },
  { href: '/admin/champion-models', label: 'Champion Models', description: '대표 모델 선정', icon: Bot },
  { href: '/admin/settings', label: '시스템 설정', description: '관리자 설정', icon: Settings2 },
];

export function menuForRole(role: AppRole): MenuItem[] { return role === 'ADMIN' ? [...USER_MENU, ...ADMIN_MENU] : USER_MENU; }

// 기존 레이아웃과의 호환 별칭입니다.
export const userMenu = USER_MENU;
export const adminMenu = ADMIN_MENU;
export const menu = { user: userMenu, admin: adminMenu };
