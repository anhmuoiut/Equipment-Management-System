import { withAuth, ok } from '@/lib/auth/withAuth';
import { equipmentTree } from '@/lib/services/equipment';
import { assertUuid } from '@/lib/services/core/validate';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await equipmentTree(assertUuid(params.id)), requestId));
