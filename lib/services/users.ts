import 'server-only';

/**
 * Module User Management — bảng user_profiles, user_histories. Chỉ Admin.
 *
 * Tài khoản không xóa, chỉ khóa (disabled). Admin tạo tài khoản → active
 * ngay, loại Local, phải đổi mật khẩu ở lần đăng nhập đầu. Lịch sử
 * (CREATE / APPROVE / ROLE_CHANGE / …) do database tự ghi.
 */
import { appWrite, db, selectAll, selectOne } from './core/db';
import { readHistory } from './core/history';
import { assertActive, auditOf, loadLookups, nameOf, userName, type Lookups } from './core/lookups';
import { notify } from './notifications';
import { AppError, mapRpcError } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';
import { normalizeUsername } from '@/lib/auth/username';
import type { AccountStatus, Role } from '@/lib/permissions';
import type { HistoryEntry, UserRow } from '@/lib/types';

type DbUser = {
  id: string; username: string; full_name: string; email: string | null; employee_id: string | null;
  department_id: string | null; role: Role; account_status: AccountStatus; approved_by: string | null;
  approved_at: string | null; auth_provider: 'supabase' | 'local'; must_change_password: boolean;
  created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
};

/** Không bao giờ đọc password_hash, token_version, sessions_revoked_at ra ngoài. */
const COLUMNS = 'id, username, full_name, email, employee_id, department_id, role, account_status, approved_by, ' +
  'approved_at, auth_provider, must_change_password, created_at, created_by, updated_at, updated_by';

function toRow(u: DbUser, lookups: Lookups): UserRow {
  return {
    ...u,
    department: nameOf(lookups.departments, u.department_id),
    approved_by_name: userName(lookups, u.approved_by),
    ...auditOf(lookups, u),
  };
}

export async function listUsers(): Promise<UserRow[]> {
  const [rows, lookups] = await Promise.all([selectAll<DbUser>('user_profiles', COLUMNS), loadLookups()]);
  return rows.map((r) => toRow(r, lookups));
}

export async function getUser(id: string): Promise<UserRow> {
  const [row, lookups] = await Promise.all([load(id), loadLookups()]);
  return toRow(row, lookups);
}

async function load(id: string): Promise<DbUser> {
  const row = await selectOne<DbUser>('user_profiles', id, COLUMNS);
  if (!row) throw new AppError('USER_NOT_FOUND');
  return row;
}

async function assertNotLastAdmin(target: DbUser) {
  if (target.role !== 'admin' || target.account_status !== 'active') return;
  const { count, error } = await db().from('user_profiles')
    .select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('account_status', 'active');
  if (error) throw mapRpcError(error);
  if ((count ?? 0) <= 1) throw new AppError('LAST_ADMIN');
}

async function assertUnique(username: string | undefined, email: string | null | undefined, exceptId?: string) {
  if (username) {
    const { data } = await db().from('user_profiles').select('id').eq('username', username).limit(2);
    if ((data ?? []).some((r) => (r as { id: string }).id !== exceptId)) throw new AppError('USERNAME_ALREADY_EXISTS');
  }
  if (email) {
    const { data } = await db().from('user_profiles').select('id').ilike('email', email.replace(/[%_\\]/g, (c) => '\\' + c)).limit(2);
    if ((data ?? []).some((r) => (r as { id: string }).id !== exceptId)) throw new AppError('EMAIL_ALREADY_EXISTS');
  }
}

export type UserCreateInput = {
  username: string; full_name: string; email?: string | null; employee_id?: string | null;
  department_id?: string | null; role: Role; password: string;
};

export async function createUser(input: UserCreateInput, actor: string): Promise<UserRow> {
  const username = normalizeUsername(input.username);
  if (!username) throw new AppError('VALIDATION_ERROR', { fields: { username: 'invalid' } });
  const email = input.email?.toLowerCase() ?? null;
  assertActive((await loadLookups()).departments, input.department_id, 'department_id');
  await assertUnique(username, email);
  const created = await appWrite<DbUser>('user_profiles', 'insert', null, {
    username, full_name: input.full_name, email, employee_id: input.employee_id ?? null,
    department_id: input.department_id ?? null, role: input.role,
    account_status: 'active', auth_provider: 'local', must_change_password: true,
    password_hash: await hashPassword(input.password),
  }, actor);
  return getUser(created.id);
}

export type UserUpdateInput = {
  username?: string; full_name?: string; email?: string | null; employee_id?: string | null;
  department_id?: string | null; role?: Role;
};

export async function updateUser(id: string, input: UserUpdateInput, actor: string): Promise<UserRow> {
  const before = await load(id);
  const patch: Record<string, unknown> = { ...input };
  if (input.username !== undefined) {
    const username = normalizeUsername(input.username);
    if (!username) throw new AppError('VALIDATION_ERROR', { fields: { username: 'invalid' } });
    patch.username = username;
  }
  if (input.email !== undefined) patch.email = input.email?.toLowerCase() ?? null;
  // Email là tên đăng nhập của tài khoản Supabase — không sửa ở đây.
  if (before.auth_provider === 'supabase' && patch.email !== undefined && patch.email !== before.email) {
    throw new AppError('VALIDATION_ERROR', { fields: { email: 'supabase_email_locked' } });
  }
  const roleChanged = input.role !== undefined && input.role !== before.role;
  if (roleChanged) {
    if (id === actor) throw new AppError('CANNOT_MODIFY_SELF');
    if (input.role !== 'admin') await assertNotLastAdmin(before);
  }
  assertActive((await loadLookups()).departments, input.department_id, 'department_id', before.department_id);
  await assertUnique(patch.username as string | undefined, patch.email as string | null | undefined, id);

  const profileKeys = ['username', 'full_name', 'email', 'employee_id', 'department_id'] as const;
  const profileChanged = profileKeys.some((k) => patch[k] !== undefined && patch[k] !== before[k]);
  // Đổi nhóm quyền và sửa thông tin ghi thành hai dòng lịch sử riêng.
  const { role, ...profilePatch } = patch;
  if (profileChanged) await appWrite('user_profiles', 'update', id, profilePatch, actor);
  if (roleChanged) await appWrite('user_profiles', 'update', id, { role }, actor);

  if (roleChanged) {
    await notify([id], { type: 'USER_ROLE_CHANGED', title: String(role), created_by: actor });
  }
  if (profileChanged && id !== actor) {
    await notify([id], { type: 'USER_PROFILE_UPDATED', title: before.full_name, created_by: actor });
  }
  return getUser(id);
}

export async function approveUser(id: string, role: Role, actor: string): Promise<UserRow> {
  const before = await load(id);
  if (before.account_status !== 'pending') throw new AppError('ACCOUNT_NOT_PENDING');
  await appWrite('user_profiles', 'update', id, {
    account_status: 'active', role, approved_by: actor, approved_at: new Date().toISOString(),
  }, actor);
  await notify([id], { type: 'USER_APPROVED', title: role, created_by: actor });
  return getUser(id);
}

export async function rejectUser(id: string, actor: string): Promise<UserRow> {
  const before = await load(id);
  if (before.account_status !== 'pending') throw new AppError('ACCOUNT_NOT_PENDING');
  await appWrite('user_profiles', 'update', id, {
    account_status: 'rejected', approved_by: actor, approved_at: new Date().toISOString(),
  }, actor);
  return getUser(id);
}

export async function setUserDisabled(id: string, disabled: boolean, actor: string): Promise<UserRow> {
  if (id === actor) throw new AppError('CANNOT_MODIFY_SELF');
  const before = await load(id);
  if (disabled) {
    await assertNotLastAdmin(before);
    await appWrite('user_profiles', 'update', id, { account_status: 'disabled' }, actor);
  } else {
    if (before.account_status !== 'disabled') throw new AppError('VALIDATION_ERROR');
    await appWrite('user_profiles', 'update', id, { account_status: 'active' }, actor);
  }
  return getUser(id);
}

/** Admin đặt lại mật khẩu: người đó phải đổi ở lần đăng nhập tới; mọi phiên cũ bị đăng xuất. */
export async function resetUserPassword(id: string, password: string, actor: string): Promise<UserRow> {
  if (id === actor) throw new AppError('CANNOT_MODIFY_SELF');
  const before = await load(id);
  if (before.auth_provider === 'local') {
    const { data, error } = await db().from('user_profiles').select('token_version').eq('id', id).maybeSingle();
    if (error || !data) throw new AppError('SERVER_ERROR');
    await appWrite('user_profiles', 'update', id, {
      password_hash: await hashPassword(password), must_change_password: true,
      token_version: (data as { token_version: number }).token_version + 1,
    }, actor, { action: 'PASSWORD_RESET' });
  } else {
    const { error } = await db().auth.admin.updateUserById(id, { password });
    if (error) throw new AppError('SERVER_ERROR', {}, { stage: 'set_password', auth: error.message });
    await appWrite('user_profiles', 'update', id, {
      must_change_password: true, sessions_revoked_at: new Date().toISOString(),
    }, actor, { action: 'PASSWORD_RESET' });
  }
  await notify([id], { type: 'USER_PASSWORD_RESET', title: before.username, created_by: actor });
  return getUser(id);
}

export function userHistory(id: string): Promise<HistoryEntry[]> {
  return readHistory('user_histories', [{ column: 'user_id', value: id }]);
}
