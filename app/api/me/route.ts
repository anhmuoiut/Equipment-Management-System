import { withAuth, ok } from '@/lib/auth/withAuth';
import { getEditableFieldKeys } from '@/lib/services/equipment';
import { getOwnAccountDetails, updateOwnProfile } from '@/lib/services/account';
import { isAdmin } from '@/lib/permissions';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';

/**
 * Hồ sơ của chính user đang đăng nhập — UI dùng để quyết định hiện nút nào.
 * Backend vẫn check lại mọi thứ; đây chỉ để không hiện nút chắc chắn bị từ chối.
 *
 * `withAuth`'s own profile query is deliberately minimal (it runs on every
 * authenticated request); employee_id/department/auth_provider only matter
 * to the account settings dialog, so they're fetched separately here rather
 * than widening that shared query for every route.
 */
export const GET = withAuth(async (_req, { requestId, profile }) => {
  const [editable, details] = await Promise.all([
    isAdmin(profile) ? Promise.resolve(null) : getEditableFieldKeys(profile.id),
    getOwnAccountDetails(profile.id),
  ]);
  return ok({ ...profile, ...details, editable_fields: editable }, requestId);
});

/**
 * Self-service profile edit — only the personal/administrative fields
 * (full name, employee ID, department). Username, email, role and every
 * permission stay admin-only (lib/services/admin.ts), never reachable here.
 */
export const PUT = withAuth(async (req, { requestId, profile }) => {
  const { full_name, employee_id, department_id } = parseBody(
    z.object({
      full_name: z.string().trim().min(1).max(200),
      employee_id: z.string().trim().max(100).nullable().optional(),
      department_id: z.string().uuid().nullable().optional(),
    }),
    await req.json(),
  );
  const updated = await updateOwnProfile(profile.id, {
    full_name,
    employee_id: employee_id?.trim() || null,
    department_id: department_id ?? null,
  }, requestId);
  return ok(updated, requestId);
});
