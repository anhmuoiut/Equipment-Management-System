import { withAuth, ok } from '@/lib/auth/withAuth';
import { getDashboardSummary, getCalibrationAttention, getOpenRepairs, getRecentActivity } from '@/lib/services/dashboard';

/**
 * One aggregated payload for the whole Dashboard — every number is a
 * grouped COUNT or small indexed lookup (see lib/services/dashboard.ts),
 * never the full equipment table. Open to every logged-in role: the
 * Dashboard is monitoring/read-only, same visibility as the Masterlist
 * itself (individual drill-down actions still go through their own
 * permission checks when the user actually acts on something).
 */
export const GET = withAuth(async (req, { requestId }) => {
  const sp = new URL(req.url).searchParams;
  const filters = {
    typeId: sp.get('typeId') ?? undefined,
    locationId: sp.get('locationId') ?? undefined,
  };
  const [summary, calibrationAttention, openRepairs, recentActivity] = await Promise.all([
    getDashboardSummary(filters),
    getCalibrationAttention(15, filters),
    getOpenRepairs(),
    getRecentActivity(),
  ]);
  return ok({ summary, calibrationAttention, openRepairs, recentActivity }, requestId);
});
