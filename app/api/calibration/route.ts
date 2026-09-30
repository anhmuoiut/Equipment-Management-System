import { withAuth, ok } from '@/lib/auth/withAuth';
import {
  CALIBRATION_LIST_STATUSES, listCalibrationOverview, type CalibrationListStatus,
} from '@/lib/services/calibration';

const MAX_PAGE_SIZE = 200;

/**
 * The Calibration page's list — calibration-required, active equipment,
 * most urgent first, with per-status counts for its filter. Same gate as
 * the per-equipment calibration route (calibration.view: viewers hold every
 * .view code, a user needs the grant).
 */
export const GET = withAuth(
  async (req, { requestId }) => {
    const sp = new URL(req.url).searchParams;
    const pageSize = Math.min(Number(sp.get('pageSize') ?? 50) || 50, MAX_PAGE_SIZE);
    const page = Math.max(Number(sp.get('page') ?? 1) || 1, 1);
    const rawStatus = sp.get('status');
    const status = (CALIBRATION_LIST_STATUSES as readonly string[]).includes(rawStatus ?? '')
      ? rawStatus as CalibrationListStatus
      : undefined;

    const { rows, total, counts, due_soon_days } = await listCalibrationOverview({
      status, search: sp.get('search') ?? undefined, page, pageSize,
    });
    return ok(rows, requestId, { page, pageSize, total, counts, due_soon_days });
  },
  { role: ['admin', 'user', 'viewer'], action: 'calibration.view' },
);
