import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { configHistory } from '@/lib/services/configuration';
import { assertUuid } from '@/lib/services/core/validate';
import { listFromParams } from '../../../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await configHistory(listFromParams(params), assertUuid(params.id)), requestId), { role: ADMINS });
