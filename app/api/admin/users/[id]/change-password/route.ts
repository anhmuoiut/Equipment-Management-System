import { withAuth, ok } from '@/lib/auth/withAuth';
import { setUserPassword } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/** Admin sets the account's real password directly (mục 27) — no temp password, nothing shown back. */
export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const { new_password } = parseBody(z.object({ new_password: z.string().min(10).max(256) }),
      await req.json());
    return ok(await setUserPassword(params.id!, new_password, profile.id, requestId), requestId);
  },
  { role: ['admin'] },
);
