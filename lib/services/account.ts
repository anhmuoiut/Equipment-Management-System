import 'server-only';

/**
 * Người đang đăng nhập tự sửa thông tin / đổi mật khẩu của chính mình
 * (khác lib/services/users.ts — admin sửa tài khoản người khác).
 */
import { db, appWrite } from './core/db';
import { supabaseAuthClient } from '@/lib/supabase/server';
import { AppError, mapRpcError } from '@/lib/errors';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { setLocalSessionCookie } from '@/lib/auth/session';

type Account = { auth_provider: string; email: string | null; password_hash: string | null; token_version: number };

async function verifyCurrentPassword(currentPassword: string, account: Account): Promise<void> {
  if (account.auth_provider === 'local') {
    if (!account.password_hash || !(await verifyPassword(currentPassword, account.password_hash))) {
      throw new AppError('CURRENT_PASSWORD_INCORRECT');
    }
    return;
  }
  const auth = await supabaseAuthClient();
  const { error } = await auth.auth.signInWithPassword({ email: account.email!, password: currentPassword });
  if (error) throw new AppError('CURRENT_PASSWORD_INCORRECT');
}

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const { data: account, error } = await db().from('user_profiles')
    .select('auth_provider, email, password_hash, token_version').eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  if (!account) throw new AppError('UNAUTHORIZED');

  await verifyCurrentPassword(currentPassword, account as Account);
  if (newPassword === currentPassword) {
    throw new AppError('VALIDATION_ERROR', { fields: { new_password: 'same_as_current' } });
  }

  // Đổi mật khẩu của chính mình không ghi lịch sử (không phải thao tác của admin).
  if (account.auth_provider === 'local') {
    const nextTokenVersion = (account as Account).token_version + 1;
    const { error: updErr } = await db().from('user_profiles')
      .update({ password_hash: await hashPassword(newPassword), must_change_password: false, token_version: nextTokenVersion })
      .eq('id', userId);
    if (updErr) throw mapRpcError(updErr);
    await setLocalSessionCookie(userId, nextTokenVersion);
  } else {
    const { error: updErr } = await db().auth.admin.updateUserById(userId, { password: newPassword });
    if (updErr) throw new AppError('SERVER_ERROR', {}, { stage: 'set_password', auth: updErr.message });
    const { error: flagErr } = await db().from('user_profiles').update({ must_change_password: false }).eq('id', userId);
    if (flagErr) throw mapRpcError(flagErr);
  }
}

export async function getOwnAccountDetails(userId: string) {
  const { data, error } = await db().from('user_profiles')
    .select('id, full_name, email, username, employee_id, department_id, role, auth_provider')
    .eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  if (!data) throw new AppError('UNAUTHORIZED');
  return data;
}

export type OwnProfilePatch = { full_name: string; employee_id: string | null; department_id: string | null };

/** Chỉ họ tên, mã nhân viên, phòng ban. Username, email, nhóm quyền do admin sửa. */
export async function updateOwnProfile(userId: string, patch: OwnProfilePatch) {
  return appWrite('user_profiles', 'update', userId, patch, userId);
}
