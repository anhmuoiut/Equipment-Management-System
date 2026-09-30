import { redirect } from 'next/navigation';
import { requirePageViewer } from '@/lib/auth/pageSession';
import { firstAdminSection } from '@/lib/permissions';
import { AdminAccessProvider } from '@/components/admin/AdminAccessContext';

/**
 * Admin screens require role=admin OR a delegated admin-category
 * permission (master_data.manage / field.manage). Each section's own
 * layout narrows that further (see canAccessAdminSection); the API layer
 * (`withAuth`) is still the real enforcement for every specific action.
 *
 * User management stays admin-only: granting accounts/permissions is a
 * privilege-escalation-sensitive capability deliberately not delegated
 * below role=admin.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageViewer();
  if (!firstAdminSection(viewer.role, viewer.permissions)) redirect('/');
  return (
    <AdminAccessProvider value={{ userId: viewer.userId, role: viewer.role, permissions: viewer.permissions }}>
      {children}
    </AdminAccessProvider>
  );
}
