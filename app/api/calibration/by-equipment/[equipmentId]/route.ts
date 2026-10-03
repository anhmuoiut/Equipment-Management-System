import { withAuth, ok } from '@/lib/auth/withAuth';
import { getCalibrationByEquipment } from '@/lib/services/calibration';
import { assertUuid } from '@/lib/services/core/validate';

/** Extension point: nhóm Hiệu chuẩn trong chi tiết thiết bị. null = chưa theo dõi. */
export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getCalibrationByEquipment(assertUuid(params.equipmentId)), requestId));
