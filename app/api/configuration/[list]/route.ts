import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { createConfig, listConfig } from '@/lib/services/configuration';
import { defined, parseBody, readJson } from '@/lib/services/core/validate';
import { listFromParams, schemaFor } from '../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await listConfig(listFromParams(params)), requestId), { role: ADMINS });

export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const list = listFromParams(params);
  const body = defined(parseBody(schemaFor(list, 'create'), await readJson(req)) as Record<string, unknown>);
  return ok(await createConfig(list, body, profile.id), requestId);
}, { role: ADMINS });
