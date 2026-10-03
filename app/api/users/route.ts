import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { createUser, listUsers } from '@/lib/services/users';
import { parseBody, readJson, z, optText, optId, reqText } from '@/lib/services/core/validate';

export const GET = withAuth(async (_req, { requestId }) => ok(await listUsers(), requestId), { role: ADMINS });

/** Admin tạo tài khoản Local — active ngay, phải đổi mật khẩu ở lần đăng nhập đầu. */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const body = parseBody(z.object({
    username: reqText(64),
    full_name: reqText(200),
    email: optText(200).refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'invalid' }),
    employee_id: optText(100),
    department_id: optId,
    role: z.enum(['admin', 'user', 'readonly']),
    password: z.string().min(10).max(256),
  }).strict(), await readJson(req));
  return ok(await createUser(body, profile.id), requestId);
}, { role: ADMINS });
