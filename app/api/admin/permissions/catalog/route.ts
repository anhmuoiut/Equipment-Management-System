import { withAuth, ok } from '@/lib/auth/withAuth';
import { getPermissionCatalog } from '@/lib/services/admin';

/** The full permission catalog (code/label/category/description), for the
 *  Users & Permissions editor to render grouped checkboxes from — never
 *  hardcoded in the frontend, so a new catalog row shows up automatically. */
export const GET = withAuth(
  async (_req, { requestId }) => ok(await getPermissionCatalog(), requestId),
  { role: ['admin'] },
);
