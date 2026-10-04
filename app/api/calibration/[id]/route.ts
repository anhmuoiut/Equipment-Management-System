import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { getCalibration, updateCalibration } from '@/lib/services/calibration';
import { assertUuid, defined, parseBody, readJson } from '@/lib/services/core/validate';
import { updateSchema } from '../schema';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getCalibration(assertUuid(params.id)), requestId));

/** Sửa (UPDATE) hoặc ghi nhận hiệu chuẩn (đổi calibration_date → CALIBRATE). */
export const PUT = withAuth(async (req, { requestId, profile, params }) => {
  const body = defined(parseBody(updateSchema, await readJson(req)));
  return ok(await updateCalibration(assertUuid(params.id), body, profile.id), requestId);
}, { role: EDITORS });
