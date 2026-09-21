import { withAuth, ok } from '@/lib/auth/withAuth';
import { getPermissionMatrix } from '@/lib/services/admin';

export const GET = withAuth(
  async (_req, { requestId }) => ok({ users: await getPermissionMatrix() }, requestId),
  { role: ['admin'] },
);
