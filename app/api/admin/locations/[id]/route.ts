import { withAuth, ok } from '@/lib/auth/withAuth';
import { updateLocation } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(
      z.object({
        code: z.string().min(1).max(50).optional(),
        name: z.string().max(200).nullish(),
        sort_order: z.number().int().optional(),
        is_active: z.boolean().optional(),
      }),
      await req.json(),
    );
    return ok(await updateLocation(params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
