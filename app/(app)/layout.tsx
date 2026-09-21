import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { getProfileIdentity, getProfilePermissions } from '@/lib/services/profile';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const profile = await getProfileIdentity(session.userId);
  if (!profile?.is_active) redirect('/login');
  if (session.tokenVersion !== null && session.tokenVersion !== profile.token_version) redirect('/login');
  // Only fetched for non-admins — an admin bypasses every permission check
  // anyway, so there's nothing this list would change for them.
  const permissions = profile.role === 'admin' ? [] : await getProfilePermissions(session.userId);
  return (
    <AppShell username={profile.username} fullName={profile.full_name} role={profile.role} permissions={permissions}>
      {children}
    </AppShell>
  );
}
