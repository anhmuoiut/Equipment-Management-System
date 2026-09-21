import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getProfileIdentity, getProfilePermissions } from '@/lib/services/profile';

/**
 * Admin screens require role=admin OR a delegated admin-category
 * permission (master_data.manage / field.manage). The API layer
 * (`withAuth`) is the real enforcement for every specific action; this
 * redirect just keeps someone with no admin-adjacent permission at all
 * from landing on a section that would fail every request they could make.
 *
 * User management stays admin-only even for a user.manage holder: granting
 * accounts/permissions is a privilege-escalation-sensitive capability this
 * migration deliberately does not delegate below role=admin (see the V2
 * migration summary). The Users page and its APIs enforce that themselves.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const profile = await getProfileIdentity(session.userId);
  if (!profile?.is_active) redirect('/login');
  if (session.tokenVersion !== null && session.tokenVersion !== profile.token_version) redirect('/login');
  if (profile.role !== 'admin') {
    const permissions = await getProfilePermissions(session.userId);
    const hasDelegatedAdminAccess = permissions.includes('master_data.manage') || permissions.includes('field.manage');
    if (!hasDelegatedAdminAccess) redirect('/');
  }
  return <>{children}</>;
}
