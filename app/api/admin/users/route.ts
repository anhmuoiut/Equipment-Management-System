import { withAuth, ok } from '@/lib/auth/withAuth';
import { listUsers, createUser } from '@/lib/services/admin';
import { parseBody } from '@/lib/validators/equipment';
import { z } from 'zod';
import { normalizeUsername } from '@/lib/auth/username';

const createUserSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  username: z.string().refine(value => normalizeUsername(value) !== null, {
    message: 'Use 1-64 letters, numbers, dots, underscores, plus signs or hyphens; start with a letter or number.',
  }),
  password: z.string().min(10).max(256),
  employee_id: z.string().max(50).nullish(),
  department_id: z.string().uuid().nullish(),
  role: z.enum(['admin', 'user', 'viewer']),
  permissions: z.array(z.string()),
  editable_fields: z.array(z.string()),
});

export const GET = withAuth(async (_req, { requestId }) => ok(await listUsers(), requestId),
  { role: ['admin'] });

/**
 * Tạo user trực tiếp — V1 không có Account Request workflow (mục 27).
 *
 * The admin sets the account's real password directly in the form; it is
 * never generated or shown back. Không phụ thuộc email: Notification nằm
 * trong Out of Scope và SMTP built-in của Supabase có rate limit quá thấp
 * để dùng thật.
 */
export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const body = parseBody(createUserSchema, await req.json());
    const result = await createUser(body as never, profile.id, requestId);
    return ok(result, requestId);
  },
  { role: ['admin'] },
);
