import { z } from 'zod';
import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { markNotificationsRead } from '@/lib/services/notifications';

const bodySchema = z.object({ keys: z.array(z.string().min(1)).min(1).max(200) });

/** Marks one or more notification keys read for the calling user only —
 *  read state is per-user, never shared (each key already scopes to a
 *  specific equipment + calibration status + due date). */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const { keys } = parseBody(bodySchema, await req.json());
  await markNotificationsRead(profile.id, keys);
  return ok({ marked: keys.length }, requestId);
});
