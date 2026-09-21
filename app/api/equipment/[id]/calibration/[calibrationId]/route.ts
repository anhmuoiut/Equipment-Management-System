import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { updateCalibrationRecord } from '@/lib/services/calibration';

const calibrationPatchSchema = z.object({
  calibration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  calibration_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  calibrated_by: z.string().trim().min(1).max(200).optional(),
});

/** Normal users cannot delete historical calibration records — only
 *  calibration.update (a separate grant from .create) can correct one. */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(calibrationPatchSchema, await req.json());
    return ok(await updateCalibrationRecord(params.calibrationId!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'calibration.update' },
);
