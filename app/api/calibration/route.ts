import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { addCalibration, listCalibration } from '@/lib/services/calibration';
import { parseBody, readJson, reqId, z } from '@/lib/services/core/validate';

/** Dashboard hiệu chuẩn — mọi nhóm. */
export const GET = withAuth(async (_req, { requestId }) => ok(await listCalibration(), requestId));

/** Đưa thiết bị vào Dashboard hiệu chuẩn — Admin, User. */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const { equipment_id } = parseBody(z.object({ equipment_id: reqId }), await readJson(req));
  return ok(await addCalibration(equipment_id, profile.id), requestId);
}, { role: EDITORS });
