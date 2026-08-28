'use client';

// 분석 화면 사이의 이동 탭입니다.
//
// 새 분석 화면을 만들면 아래 목록에 한 줄 추가합니다.
// 메뉴 정의는 lib/menu.ts에서만 관리합니다.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { userMenu } from '@/lib/menu';

export default function AnalysisTabs() {
  const pathname = usePathname();
  const tabs = userMenu.filter((item) => item.href.startsWith('/analysis/'));

  return <>{tabs.map((tab) => <Link key={tab.href} href={tab.href} className={`analysis-tab ${pathname === tab.href ? 'active' : ''}`} aria-current={pathname === tab.href ? 'page' : undefined}>{tab.label}</Link>)}</>;
}
