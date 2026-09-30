import { withAuth, ok } from '@/lib/auth/withAuth';
import { setUserAccess } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/**
 * One-by-one permission assignment (mục 30) — no presets. Role, permission
 * codes and editable fields are saved together in one transaction; `role`
 * may be omitted to keep the current one.
 */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(
      z.object({
        role: z.enum(['admin', 'user', 'viewer']).optional(),
        permissions: z.array(z.string()),
        editable_fields: z.array(z.string()),
      }),
      await req.json(),
    );
    return ok(await setUserAccess(params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin'] },
);
