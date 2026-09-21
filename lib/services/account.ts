import 'server-only';

/**
 * Self-service account actions — the signed-in user acting on THEIR OWN
 * password/profile, as opposed to `lib/services/admin.ts` (an admin acting
 * on someone else's). The one real difference from admin.ts's
 * `setUserPassword`: changing your own password requires proving you still
 * know the current one first. An admin's authority to reset someone else's
 * password doesn't depend on that, so that check only lives here.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
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
  // Same client + call login.ts uses to verify a Supabase account's password —
  // it re-confirms the cookie-bound session with the same credentials rather
  // than starting an unrelated one.
  const auth = await supabaseAuthClient();
  const { error } = await auth.auth.signInWithPassword({ email: account.email!, password: currentPassword });
  if (error) throw new AppError('CURRENT_PASSWORD_INCORRECT');
}

export async function changeOwnPassword(
  userId: string, currentPassword: string, newPassword: string, reqId: string,
): Promise<void> {
  const db = supabaseAdmin();
  const { data: account, error } = await db.from('user_profiles')
    .select('auth_provider, email, password_hash, token_version')
    .eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  if (!account) throw new AppError('UNAUTHORIZED');

  await verifyCurrentPassword(currentPassword, account as Account);

  if (account.auth_provider === 'local') {
    const password_hash = await hashPassword(newPassword);
    // Bumping token_version invalidates every local-session cookie issued
    // with the old password — including the one making this request, so we
    // immediately re-issue it below with the new version already baked in.
    const nextTokenVersion = (account as Account).token_version + 1;
    const { error: updErr } = await db.from('user_profiles')
      .update({ password_hash, must_change_password: false, token_version: nextTokenVersion })
      .eq('id', userId);
    if (updErr) throw mapRpcError(updErr);
    await setLocalSessionCookie(userId, nextTokenVersion);
  } else {
    const { error: updErr } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (updErr) throw new AppError('SERVER_ERROR', { stage: 'set_password' });
    await db.from('user_profiles').update({ must_change_password: false }).eq('id', userId);
  }

  await db.from('audit_log').insert({
    entity_type: 'user', entity_id: userId, action: 'USER_PASSWORD_CHANGE',
    changes: { password_changed: { old: null, new: true } }, changed_by: userId, request_id: reqId,
  });
}

/**
 * The fuller set of self-service fields `withAuth`'s shared profile query
 * doesn't select (that one is deliberately minimal — it's read on every
 * authenticated request). Only the account settings dialog needs these.
 */
export async function getOwnAccountDetails(userId: string) {
  const { data, error } = await supabaseAdmin().from('user_profiles')
    .select('full_name, email, username, employee_id, department_id, auth_provider')
    .eq('id', userId).maybeSingle();
  if (error) throw new AppError('SERVER_ERROR');
  if (!data) throw new AppError('UNAUTHORIZED');
  return data;
}

export type OwnProfilePatch = { full_name: string; employee_id: string | null; department_id: string | null };

export async function updateOwnProfile(userId: string, patch: OwnProfilePatch, reqId: string) {
  const db = supabaseAdmin();
  const { data: before, error: beforeErr } = await db.from('user_profiles')
    .select('full_name, employee_id, department_id').eq('id', userId).maybeSingle();
  if (beforeErr) throw new AppError('SERVER_ERROR');
  if (!before) throw new AppError('UNAUTHORIZED');

  const { data, error } = await db.from('user_profiles')
    .update({ full_name: patch.full_name, employee_id: patch.employee_id, department_id: patch.department_id })
    .eq('id', userId)
    .select('id, full_name, employee_id, department_id')
    .maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  (['full_name', 'employee_id', 'department_id'] as const).forEach((key) => {
    if (before[key] !== patch[key]) changes[key] = { old: before[key], new: patch[key] };
  });
  if (Object.keys(changes).length > 0) {
    await db.from('audit_log').insert({
      entity_type: 'user', entity_id: userId, action: 'USER_PROFILE_UPDATE',
      changes, changed_by: userId, request_id: reqId,
    });
  }

  return data;
}
