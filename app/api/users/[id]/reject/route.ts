import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { rejectUser } from '@/lib/services/users';
import { assertUuid } from '@/lib/services/core/validate';

export const POST = withAuth(async (_req, { requestId, profile, params }) =>
  ok(await rejectUser(assertUuid(params.id), profile.id), requestId), { role: ADMINS });
