import { withAuth, ok } from '@/lib/auth/withAuth';
import { updateFieldDefinition, countMissingValues, deleteCustomField } from '@/lib/services/admin';

/**
 * is_required sửa được BẤT KỲ LÚC NÀO — không có is_finalized. Validation áp
 * dụng theo payload, không theo record, nên bật Required không làm chết các
 * record cũ đang thiếu giá trị.
 *
 * GET trả kèm missing_count để UI cảnh báo trước khi Admin bật Required.
 */
export const GET = withAuth(
  async (_req, { requestId, params }) =>
    ok({ field_key: params.fieldKey, missing_count: await countMissingValues(params.fieldKey!) },
      requestId),
  { role: ['admin', 'user'], action: 'field.manage' },
);

export const PUT = withAuth(
  async (req, { requestId, profile, params }) =>
    ok(await updateFieldDefinition(params.fieldKey!, await req.json(), profile.id, requestId),
      requestId),
  { role: ['admin', 'user'], action: 'field.manage' },
);

/** Custom fields only — system fields can never be removed. */
export const DELETE = withAuth(
  async (_req, { requestId, profile, params }) => {
    await deleteCustomField(params.fieldKey!, profile.id, requestId);
    return ok({ field_key: params.fieldKey, deleted: true }, requestId);
  },
  { role: ['admin', 'user'], action: 'field.manage' },
);
