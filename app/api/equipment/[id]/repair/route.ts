import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { listRepairRecords, createRepairRecord } from '@/lib/services/repair';

const repairSchema = z.object({
  repair_type: z.enum(['internal', 'vendor']),
  problem: z.string().trim().max(2000).nullish(),
  repair_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  repair_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  vendor_name: z.string().trim().max(200).nullish(),
  repair_action: z.string().trim().max(2000).nullish(),
  repair_result: z.string().trim().max(2000).nullish(),
  quotation_ref: z.string().trim().max(200).nullish(),
  repair_cost: z.number().nonnegative().nullish(),
  remark: z.string().trim().max(1000).nullish(),
});

export const GET = withAuth(
  async (_req, { requestId, params }) => ok(await listRepairRecords(params.id!), requestId),
  { role: ['admin', 'user', 'viewer'], action: 'repair.view' },
);

export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(repairSchema, await req.json());
    return ok(await createRepairRecord(params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'repair.create' },
);
