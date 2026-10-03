import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { createGolden, listGolden } from '@/lib/services/golden';
import { defined, parseBody, readJson } from '@/lib/services/core/validate';
import { createSchema } from './schema';

export const GET = withAuth(async (_req, { requestId }) => ok(await listGolden(), requestId));

export const POST = withAuth(async (req, { requestId, profile }) => {
  const { row, duplicate } = await createGolden(defined(parseBody(createSchema, await readJson(req))), profile.id);
  return ok(row, requestId, { duplicate });
}, { role: EDITORS });
