import { withAuth, ok } from '@/lib/auth/withAuth';
import { listCalibration } from '@/lib/services/calibration';

/** Dashboard hiệu chuẩn — mọi nhóm. Dòng do database tự thêm / bỏ theo Configuration › Hiệu chuẩn › Setup. */
export const GET = withAuth(async (_req, { requestId }) => ok(await listCalibration(), requestId));
