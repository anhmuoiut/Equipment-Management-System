import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { deleteConfig, getConfig, updateConfig } from '@/lib/services/configuration';
import { assertUuid, defined, parseBody, readJson } from '@/lib/services/core/validate';
import { listFromParams, schemaFor } from '../../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getConfig(listFromParams(params), assertUuid(params.id)), requestId), { role: ADMINS });

/** Sửa — kể cả ẩn / hiện lại (is_active). */
export const PUT = withAuth(async (req, { requestId, profile, params }) => {
  const list = listFromParams(params);
  const body = defined(parseBody(schemaFor(list, 'update'), await readJson(req)) as Record<string, unknown>);
  return ok(await updateConfig(list, assertUuid(params.id), body, profile.id), requestId);
}, { role: ADMINS });

/** Xóa thật — chỉ Status, Hiệu chuẩn › Setup và Interval. */
export const DELETE = withAuth(async (_req, { requestId, profile, params }) => {
  await deleteConfig(listFromParams(params), assertUuid(params.id), profile.id);
  return ok({ deleted: true }, requestId);
}, { role: ADMINS });
