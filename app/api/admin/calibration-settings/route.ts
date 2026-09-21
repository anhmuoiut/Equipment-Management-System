import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { getDueSoonDays, setDueSoonDays } from '@/lib/services/calibration';

/** The configurable Calibration Due Soon warning window (days) — an
 *  app_settings row, editable here instead of hardcoded in the view/UI. */
export const GET = withAuth(
  async (_req, { requestId }) => ok({ due_soon_days: await getDueSoonDays() }, requestId),
  { role: ['admin', 'user', 'viewer'] },
);

export const PUT = withAuth(
  async (req, { requestId, profile }) => {
    const { due_soon_days } = parseBody(z.object({ due_soon_days: z.number().int().min(1).max(3650) }), await req.json());
    await setDueSoonDays(due_soon_days, profile.id, requestId);
    return ok({ due_soon_days }, requestId);
  },
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
