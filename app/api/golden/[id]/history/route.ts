import { withAuth, ok } from '@/lib/auth/withAuth';
import { goldenHistory } from '@/lib/services/golden';
import { assertUuid } from '@/lib/services/core/validate';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await goldenHistory(assertUuid(params.id)), requestId));
