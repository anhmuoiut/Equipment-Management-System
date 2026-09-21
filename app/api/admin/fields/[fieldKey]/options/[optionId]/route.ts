import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { fieldOptionPatchSchema } from '@/lib/validators/field-config';
import { updateFieldOption } from '@/lib/services/admin';

export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(fieldOptionPatchSchema, await req.json());
    return ok(await updateFieldOption(params.optionId!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'field.manage' },
);
