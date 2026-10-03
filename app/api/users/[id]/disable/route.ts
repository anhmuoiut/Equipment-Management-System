import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { setUserDisabled } from '@/lib/services/users';
import { assertUuid } from '@/lib/services/core/validate';

/** Khóa tài khoản (không xóa). */
export const POST = withAuth(async (_req, { requestId, profile, params }) =>
  ok(await setUserDisabled(assertUuid(params.id), true, profile.id), requestId), { role: ADMINS });
