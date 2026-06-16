import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getUserPermissions } from '@/lib/rbac';
import { PERMISSION_KEYS } from '@/types/rbac';

export default async function HomePage(): Promise<never> {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  const permissions = await getUserPermissions(session.userId, session.organizationId);

  if (permissions.includes(PERMISSION_KEYS.VIEW_FINANCE_DASHBOARD)) {
    redirect('/finance/dashboard');
  }

  if (permissions.includes(PERMISSION_KEYS.VIEW_SELF_STREAMS)) {
    redirect('/me');
  }

  redirect('/settings/wallets');
}
