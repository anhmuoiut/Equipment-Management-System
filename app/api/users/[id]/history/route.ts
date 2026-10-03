import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { userHistory } from '@/lib/services/users';
import { assertUuid } from '@/lib/services/core/validate';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await userHistory(assertUuid(params.id)), requestId), { role: ADMINS });
