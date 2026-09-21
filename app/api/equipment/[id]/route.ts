import { withAuth, ok } from '@/lib/auth/withAuth';
import {
  getEquipment, updateEquipmentFromFields, getFieldDefinitions,
  getEditableFieldKeys, getActiveRefLookup, findDuplicates,
} from '@/lib/services/equipment';
import { assertFields, isAdmin } from '@/lib/permissions';
import { putSchema, parseBody, validateFields } from '@/lib/validators/equipment';

export const GET = withAuth(async (_req, { requestId, params }) =>
  ok(await getEquipment(params.id!), requestId),
);

/**
 * PUT là thao tác SINGLE-ROW, KHÔNG cascade.
 * current_location_id và parent_id bị chặn ở cả 3 tầng:
 *   validator (PUT_FORBIDDEN_FIELDS) → whitelist trong RPC → không có trong field_definitions
 */
export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(putSchema, await req.json());
    const defs = await getFieldDefinitions(true);
    const activeRefs = await getActiveRefLookup();
    const clean = validateFields(body.fields, defs, 'update', activeRefs);

    const editable = isAdmin(profile) ? Object.keys(clean) : await getEditableFieldKeys(profile.id);
    assertFields(profile, Object.keys(clean), editable);

    const updated = await updateEquipmentFromFields(params.id!, body.version, clean, defs, profile.id, requestId);

    const dup = await findDuplicates(
      (updated as Record<string, unknown>).part_number as string | null,
      (updated as Record<string, unknown>).serial_number as string | null,
    );

    return ok(updated, requestId, {
      duplicate_warning: dup.length > 1 ? { code: 'DUPLICATE_WARNING', matches: dup } : null,
    });
  },
  { role: ['admin', 'user'] },
);
