import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { resetUserPassword } from '@/lib/services/users';
import { assertUuid, parseBody, readJson, z } from '@/lib/services/core/validate';

/** Admin đặt lại mật khẩu. */
export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const { password } = parseBody(z.object({ password: z.string().min(10).max(256) }), await readJson(req));
  return ok(await resetUserPassword(assertUuid(params.id), password, profile.id), requestId);
}, { role: ADMINS });
