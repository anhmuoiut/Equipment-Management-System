import { withAuth, ok } from '@/lib/auth/withAuth';
import { changeOwnPassword } from '@/lib/services/account';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/** Any signed-in user changes their own password — requires the current one, unlike an admin's reset. */
export const PUT = withAuth(async (req, { requestId, profile }) => {
  const { current_password, new_password } = parseBody(
    z.object({ current_password: z.string().min(1).max(256), new_password: z.string().min(10).max(256) }),
    await req.json(),
  );
  await changeOwnPassword(profile.id, current_password, new_password, requestId);
  return ok({ changed: true }, requestId);
}, { allowPendingPasswordChange: true });
