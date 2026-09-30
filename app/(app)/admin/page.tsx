import { redirect } from 'next/navigation';
import { requirePageViewer } from '@/lib/auth/pageSession';
import { ADMIN_SECTION_PATHS, firstAdminSection } from '@/lib/permissions';

/** Lands on the first admin section this account can actually use — a
 *  delegated master-data/field manager would only get 403s on Users. */
export default async function AdminIndex() {
  const viewer = await requirePageViewer();
  const section = firstAdminSection(viewer.role, viewer.permissions);
  redirect(section ? ADMIN_SECTION_PATHS[section] : '/');
}
