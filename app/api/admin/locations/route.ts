import { withAuth, ok } from '@/lib/auth/withAuth';
import { listLocations, createLocation } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

export const GET = withAuth(async (_req, { requestId }) => ok(await listLocations(false), requestId),
  { role: ['admin', 'user'], action: 'master_data.manage' });

export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const body = parseBody(
      z.object({
        code: z.string().min(1).max(50),
        name: z.string().max(200).nullish(),
        sort_order: z.number().int().optional(),
      }),
      await req.json(),
    );
    return ok(await createLocation(body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
