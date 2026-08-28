import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getDefaultRouteForRole } from '@/lib/auth-policy';

export default async function UserHome() {
  const { profile } = await requireUser();
  redirect(getDefaultRouteForRole(profile.role));
}
