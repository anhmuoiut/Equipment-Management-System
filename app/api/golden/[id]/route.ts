import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS, EDITORS } from '@/lib/permissions';
import { deleteGolden, getGolden, updateGolden } from '@/lib/services/golden';
import { assertUuid, defined, parseBody, readJson } from '@/lib/services/core/validate';
import { updateSchema } from '../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getGolden(assertUuid(params.id)), requestId));

export const PUT = withAuth(async (req, { requestId, profile, params }) => {
  const { row, duplicate } = await updateGolden(
    assertUuid(params.id), defined(parseBody(updateSchema, await readJson(req))), profile.id);
  return ok(row, requestId, { duplicate });
}, { role: EDITORS });

export const DELETE = withAuth(async (_req, { requestId, profile, params }) => {
  await deleteGolden(assertUuid(params.id), profile.id);
  return ok({ deleted: true }, requestId);
}, { role: ADMINS });
