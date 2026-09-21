import { withAuth, ok } from '@/lib/auth/withAuth';
import { getFieldDefinitions } from '@/lib/services/equipment';
import { createCustomField } from '@/lib/services/admin';
import { validateCreateCustomField } from '@/lib/validators/field-config';

export const GET = withAuth(async (_req, { requestId }) =>
  ok(await getFieldDefinitions(true), requestId), { role: ['admin', 'user'], action: 'field.manage' });

/** Admin-created custom field — always is_system = false. */
export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const defs = await getFieldDefinitions(true);
    const clean = validateCreateCustomField(defs.map((d) => d.field_key), await req.json());
    return ok(await createCustomField(clean, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'field.manage' },
);
