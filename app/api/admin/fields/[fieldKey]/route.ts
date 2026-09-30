import { withAuth, ok } from '@/lib/auth/withAuth';
import { updateFieldDefinition, getFieldImpact, deleteCustomField } from '@/lib/services/admin';

/**
 * is_required sửa được BẤT KỲ LÚC NÀO — không có is_finalized. Validation áp
 * dụng theo payload, không theo record, nên bật Required không làm chết các
 * record cũ đang thiếu giá trị.
 *
 * GET trả kèm để UI cảnh báo trước khi lưu: missing_count (record đang thiếu
 * giá trị), filled_count (custom field: record sẽ mất giá trị nếu xoá field)
 * và blocked_creators (user có quyền tạo thiết bị nhưng không sửa được field
 * này — nếu field Required thì họ không tạo được thiết bị nào).
 */
export const GET = withAuth(
  async (_req, { requestId, params }) => ok(await getFieldImpact(params.fieldKey!), requestId),
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
  async (_req, { requestId, profile, params }) =>
    ok(await deleteCustomField(params.fieldKey!, profile.id, requestId), requestId),
  { role: ['admin', 'user'], action: 'field.manage' },
);
