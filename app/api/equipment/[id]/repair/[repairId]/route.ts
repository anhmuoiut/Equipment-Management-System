import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { updateRepairRecord } from '@/lib/services/repair';

const repairPatchSchema = z.object({
  repair_type: z.enum(['internal', 'vendor']).optional(),
  problem: z.string().trim().max(2000).nullish(),
  repair_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  repair_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  vendor_name: z.string().trim().max(200).nullish(),
  repair_action: z.string().trim().max(2000).nullish(),
  repair_result: z.string().trim().max(2000).nullish(),
  quotation_ref: z.string().trim().max(200).nullish(),
  repair_cost: z.number().nonnegative().nullish(),
  remark: z.string().trim().max(1000).nullish(),
}).partial();

/** Correcting an existing record — repair.update is a separate grant from
 *  repair.create, same distinction calibration draws. No delete endpoint. */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(repairPatchSchema, await req.json());
    return ok(await updateRepairRecord(params.repairId!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'repair.update' },
);
