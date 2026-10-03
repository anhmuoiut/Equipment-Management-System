import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS, EDITORS } from '@/lib/permissions';
import { deleteEquipment, getEquipment, updateEquipment } from '@/lib/services/equipment';
import { assertUuid, childrenMode, defined, parseBody, readJson } from '@/lib/services/core/validate';
import { updateSchema } from '../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getEquipment(assertUuid(params.id)), requestId));

export const PUT = withAuth(async (req, { requestId, profile, params }) => {
  const body = defined(parseBody(updateSchema, await readJson(req)));
  const { row, duplicate } = await updateEquipment(assertUuid(params.id), body, profile.id);
  return ok(row, requestId, { duplicate });
}, { role: EDITORS });

/** Xóa thật — chỉ Admin. `?children=stay`: chỉ xóa thiết bị này, con gắn vào cha cũ; mặc định xóa cả cây con. */
export const DELETE = withAuth(async (req, { requestId, profile, params }) => {
  const children = parseBody(childrenMode, new URL(req.url).searchParams.get('children') ?? undefined);
  return ok({ deleted: await deleteEquipment(assertUuid(params.id), profile.id, children) }, requestId);
}, { role: ADMINS });
