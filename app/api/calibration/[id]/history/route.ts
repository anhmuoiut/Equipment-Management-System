import { withAuth, ok } from '@/lib/auth/withAuth';
import { calibrationHistory } from '@/lib/services/calibration';
import { assertUuid } from '@/lib/services/core/validate';

/** ?only=calibrate → chỉ các lần hiệu chuẩn. */
export const GET = withAuth(async (req, { requestId, params }) => {
  const only = new URL(req.url).searchParams.get('only') === 'calibrate';
  return ok(await calibrationHistory(assertUuid(params.id), only), requestId);
});
