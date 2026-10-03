import 'server-only';

/**
 * Tự đăng ký tài khoản (auth_provider = 'local').
 *
 * Luồng (docs/DATABASE_MODIFIED.md mục 6): tài khoản mới ở trạng thái
 * `pending`, chưa đăng nhập được → mỗi admin nhận thông báo
 * USER_APPROVAL_REQUEST → admin duyệt (chọn nhóm quyền) hoặc từ chối.
 * Có giới hạn số lần theo IP vì đây là endpoint công khai.
 */
import { db, appWrite } from './core/db';
import { AppError } from '@/lib/errors';
import { normalizeUsername } from '@/lib/auth/username';
import { hashPassword } from '@/lib/auth/password';
import { notifyAdmins } from './notifications';

const attempts = new Map<string, { count: number; expires: number }>();
function limitAttempts(key: string) {
  const now = Date.now();
  const previous = attempts.get(key);
  if (!previous || previous.expires <= now) {
    if (attempts.size >= 2000) attempts.delete(attempts.keys().next().value!);
    attempts.set(key, { count: 1, expires: now + 3_600_000 });
  } else {
    previous.count++;
    if (previous.count > 5) throw new AppError('LOGIN_RATE_LIMITED');
  }
}

export type RequestAccountInput = {
  full_name?: unknown; username?: unknown; password?: unknown; email?: unknown; employee_id?: unknown;
};

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestAccount(input: RequestAccountInput, ip: string) {
  const full_name = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const username = normalizeUsername(input.username);
  const password = typeof input.password === 'string' ? input.password : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() || null : null;
  const employee_id = typeof input.employee_id === 'string' ? input.employee_id.trim() || null : null;

  if (!full_name || full_name.length > 200) throw new AppError('VALIDATION_ERROR', { fields: { full_name: 'required' } });
  if (!username) throw new AppError('VALIDATION_ERROR', { fields: { username: 'invalid format' } });
  if (password.length < 10 || password.length > 256) {
    throw new AppError('VALIDATION_ERROR', { fields: { password: 'must be 10-256 characters' } });
  }
  if (email && (email.length > 200 || !EMAIL_FORMAT.test(email))) {
    throw new AppError('VALIDATION_ERROR', { fields: { email: 'invalid format' } });
  }
  // Chỉ đếm lần gửi hợp lệ (chạm tới database) — nhập sai định dạng không làm khóa người dùng.
  limitAttempts(ip);

  const { data: conflicts, error: lookupError } = await db().from('user_profiles').select('id').eq('username', username).limit(1);
  if (lookupError) throw new AppError('SERVER_ERROR');
  if (conflicts?.length) throw new AppError('USERNAME_ALREADY_EXISTS');
  if (email) {
    const { data: emailConflicts, error: emailError } = await db().from('user_profiles')
      .select('id').ilike('email', email.replace(/[%_\\]/g, (c) => '\\' + c)).limit(1);
    if (emailError) throw new AppError('SERVER_ERROR');
    if (emailConflicts?.length) throw new AppError('EMAIL_ALREADY_EXISTS');
  }

  // created_by trống = tự đăng ký → lịch sử ghi REGISTER.
  const created = await appWrite<{ id: string }>('user_profiles', 'insert', null, {
    full_name, username, email, employee_id,
    role: 'readonly', account_status: 'pending', must_change_password: false,
    auth_provider: 'local', password_hash: await hashPassword(password),
  }, null).catch((e) => {
    if (e instanceof AppError && e.code === 'DUPLICATE_VALUE') throw new AppError('USERNAME_ALREADY_EXISTS');
    throw e;
  });

  await notifyAdmins({
    type: 'USER_APPROVAL_REQUEST',
    title: full_name,
    message: username,
    link: `/users?id=${created.id}`,
    entity_id: created.id,
  });
  return { user_id: created.id };
}
