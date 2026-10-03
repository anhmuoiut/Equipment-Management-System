import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseAuthClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { normalizeUsername } from '@/lib/auth/username';
import { verifyPassword } from '@/lib/auth/password';
import { setLocalSessionCookie } from '@/lib/auth/session';

// A bounded per-instance guard supplements Supabase Auth's own rate limits.
// It is not a shared, deployment-wide rate limiter.
const attempts = new Map<string, { count: number; expires: number }>();
function limitAttempts(username: string) {
  const now = Date.now();
  const previous = attempts.get(username);
  if (!previous || previous.expires <= now) {
    if (attempts.size >= 2000) attempts.delete(attempts.keys().next().value!);
    attempts.set(username, { count: 1, expires: now + 60_000 });
  } else {
    previous.count++;
    if (previous.count > 10) throw new AppError('LOGIN_RATE_LIMITED');
  }
}

/** Tài khoản chỉ đăng nhập được khi account_status = active. Trạng thái khác
 *  chỉ được báo SAU khi mật khẩu đúng, để không lộ tài khoản tồn tại hay không. */
function assertCanSignIn(status: string) {
  if (status === 'active') return;
  if (status === 'pending') throw new AppError('ACCOUNT_PENDING');
  throw new AppError('USER_INACTIVE');
}

export async function loginWithUsername(input: { username?: unknown; password?: unknown }) {
  const username = normalizeUsername(input.username);
  if (!username || typeof input.password !== 'string' ||
      !input.password || input.password.length > 256) throw new AppError('INVALID_CREDENTIALS');
  limitAttempts(username);

  // Never send the resolved email, service key or session tokens in a JSON response.
  const { data, error } = await supabaseAdmin().from('user_profiles')
    .select('id, email, account_status, auth_provider, password_hash, token_version')
    .eq('username', username)
    .limit(2);
  if (error) throw new AppError('SERVER_ERROR');
  if (data?.length !== 1) throw new AppError('INVALID_CREDENTIALS');
  const account = data[0]!;

  if (account.auth_provider === 'local') {
    if (!account.password_hash || !(await verifyPassword(input.password, account.password_hash))) {
      throw new AppError('INVALID_CREDENTIALS');
    }
    assertCanSignIn(account.account_status);
    await setLocalSessionCookie(account.id, account.token_version);
    attempts.delete(username);
    return;
  }

  if (!account.email) throw new AppError('INVALID_CREDENTIALS');
  const auth = await supabaseAuthClient();
  const result = await auth.auth.signInWithPassword({ email: account.email, password: input.password });
  if (result.error) {
    if (result.error.status === 429) throw new AppError('LOGIN_RATE_LIMITED');
    throw new AppError('INVALID_CREDENTIALS');
  }
  if (result.data.user?.id !== account.id || account.account_status !== 'active') {
    await auth.auth.signOut();
    if (result.data.user?.id !== account.id) throw new AppError('INVALID_CREDENTIALS');
    assertCanSignIn(account.account_status);
  }
  attempts.delete(username);
}
