import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { listCalibrationRecords, createCalibrationRecord, getCalibrationStatus } from '@/lib/services/calibration';

const calibrationSchema = z.object({
  calibration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calibration_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calibrated_by: z.string().trim().min(1).max(200),
});

export const GET = withAuth(
  async (_req, { requestId, params }) => {
    const [status, records] = await Promise.all([
      getCalibrationStatus(params.id!),
      listCalibrationRecords(params.id!),
    ]);
    return ok({ status, records }, requestId);
  },
  { role: ['admin', 'user', 'viewer'], action: 'calibration.view' },
);

export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(calibrationSchema, await req.json());
    return ok(await createCalibrationRecord(params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'calibration.create' },
);
