import { withAuth, ok } from '@/lib/auth/withAuth';
import { getOwnAccountDetails, updateOwnProfile } from '@/lib/services/account';
import { parseBody, readJson, z, optText, optId } from '@/lib/services/core/validate';

/** Hồ sơ của chính người đang đăng nhập. */
export const GET = withAuth(async (_req, { requestId, profile }) =>
  ok(await getOwnAccountDetails(profile.id), requestId),
{ allowPendingPasswordChange: true });

/** Tự sửa họ tên, mã nhân viên, phòng ban. */
export const PUT = withAuth(async (req, { requestId, profile }) => {
  const body = parseBody(z.object({
    full_name: z.string().trim().min(1).max(200),
    employee_id: optText(100),
    department_id: optId,
  }), await readJson(req));
  const updated = await updateOwnProfile(profile.id, {
    full_name: body.full_name, employee_id: body.employee_id ?? null, department_id: body.department_id ?? null,
  });
  return ok(updated, requestId);
});
