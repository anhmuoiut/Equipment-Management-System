import { withAuth, ok } from '@/lib/auth/withAuth';
import { setUserAccess } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/** Role only, grants kept. The Users screen saves role + permissions together through /permissions. */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const { role } = parseBody(z.object({ role: z.enum(['admin', 'user', 'viewer']) }),
      await req.json());
    return ok(await setUserAccess(params.id!, { role }, profile.id, requestId), requestId);
  },
  { role: ['admin'] },
);
