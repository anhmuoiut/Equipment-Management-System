import { withAuth, ok } from '@/lib/auth/withAuth';
import { updateUserProfile } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/** Admin edits an account's details. Username (the sign-in name), role and
 *  permissions are not editable here — see /permissions for access. */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(
      z.object({
        full_name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(200).nullable(),
        employee_id: z.string().trim().max(50).nullable(),
        department_id: z.string().uuid().nullable(),
      }).strict(),
      await req.json(),
    );
    return ok(await updateUserProfile(params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin'] },
);
