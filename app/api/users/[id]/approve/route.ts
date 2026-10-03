import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { approveUser } from '@/lib/services/users';
import { assertUuid, parseBody, readJson, z } from '@/lib/services/core/validate';

/** Duyệt tài khoản đăng ký — chọn nhóm quyền lúc duyệt. */
export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const { role } = parseBody(z.object({ role: z.enum(['admin', 'user', 'readonly']) }), await readJson(req));
  return ok(await approveUser(assertUuid(params.id), role, profile.id), requestId);
}, { role: ADMINS });
