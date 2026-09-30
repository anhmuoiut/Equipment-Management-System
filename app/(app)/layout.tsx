import { redirect } from 'next/navigation';
import { requirePageViewer } from '@/lib/auth/pageSession';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageViewer();
  // Admin-set password (new account or reset): the admin knows it, so the
  // user picks their own before anything else (withAuth enforces the same
  // for every API route).
  if (viewer.mustChangePassword) redirect('/change-password');
  return (
    <AppShell username={viewer.username} fullName={viewer.fullName} role={viewer.role} permissions={viewer.permissions}>
      {children}
    </AppShell>
  );
}
