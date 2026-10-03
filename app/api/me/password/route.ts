import { withAuth, ok } from '@/lib/auth/withAuth';
import { changeOwnPassword } from '@/lib/services/account';
import { parseBody, readJson, z } from '@/lib/services/core/validate';

/** Tự đổi mật khẩu — phải nhập đúng mật khẩu hiện tại. */
export const PUT = withAuth(async (req, { requestId, profile }) => {
  const { current_password, new_password } = parseBody(
    z.object({ current_password: z.string().min(1).max(256), new_password: z.string().min(10).max(256) }),
    await readJson(req),
  );
  await changeOwnPassword(profile.id, current_password, new_password);
  return ok({ changed: true }, requestId);
}, { allowPendingPasswordChange: true });
