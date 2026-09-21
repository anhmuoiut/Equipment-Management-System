import { withAuth, ok } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/validators/equipment';
import { fieldOptionSchema } from '@/lib/validators/field-config';
import { listFieldOptions, createFieldOption, resolveCustomDropdownFieldId } from '@/lib/services/admin';

export const GET = withAuth(
  async (_req, { requestId, params }) =>
    ok(await listFieldOptions(await resolveCustomDropdownFieldId(params.fieldKey!)), requestId),
  { role: ['admin', 'user'], action: 'field.manage' },
);

export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const fieldDefinitionId = await resolveCustomDropdownFieldId(params.fieldKey!);
    const body = parseBody(fieldOptionSchema, await req.json());
    return ok(await createFieldOption(fieldDefinitionId, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'field.manage' },
);
