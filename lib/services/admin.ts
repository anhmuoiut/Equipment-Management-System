import 'server-only';

/**
 * Admin service — V2.
 *
 * Admin-created accounts (this file) use real Supabase Auth — an email +
 * a password the admin sets directly, mainly for admins themselves. Regular
 * users can also self-request an account (`lib/services/signup.ts`) with a
 * username and password stored and verified by this app directly
 * (`auth_provider = 'local'`, see `lib/auth/password.ts`); those requests
 * land inactive as role='viewer' and are approved by reactivating them here
 * (and switching them to role='user' if they should do more than view).
 * `setUserPassword` below handles both kinds.
 *
 * Permission is assigned one-by-one per user: an explicit list of
 * permission catalog codes (equipment.create, calibration.view, …) plus an
 * explicit list of field_keys the user may edit — no fixed presets. Admin
 * bypasses all of this regardless of what's stored on the row.
 *
 * Every multi-step user/permission write is one RPC (database/migrations/
 * 003_admin_hardening.sql) — a single transaction that also refuses to
 * remove the last active admin or let an admin lock themselves out.
 */
import { normalizeUsername } from '@/lib/auth/username';
import { hashPassword } from '@/lib/auth/password';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';
import { validateFieldConfigPatch, type validateCreateCustomField } from '@/lib/validators/field-config';
import { REF_FIELD_COLUMN } from '@/lib/validators/equipment';
import type { Role } from '@/lib/permissions';

async function audit(
  entityType: 'user' | 'field' | 'location' | 'permission',
  entityId: string | null,
  action: string,
  changes: Record<string, unknown>,
  actor: string,
  reqId: string,
) {
  const { error } = await supabaseAdmin().from('audit_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    changes,
    changed_by: actor,
    request_id: reqId,
  });
  if (error) throw mapRpcError(error);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw mapRpcError(error);
  return data as T;
}

/** A Postgres unique violation on one of user_profiles' identity indexes. */
function identityConflict(error: { code?: string; message?: string }): AppError | null {
  if (error.code !== '23505') return null;
  if (error.message?.includes('uq_user_profiles_username')) return new AppError('USERNAME_ALREADY_EXISTS');
  if (error.message?.includes('uq_user_profiles_email')) return new AppError('EMAIL_ALREADY_EXISTS');
  return null;
}

async function emailTaken(email: string, exceptUserId?: string): Promise<boolean> {
  let q = supabaseAdmin().from('user_profiles').select('id')
    .ilike('email', email.replace(/[%_\\]/g, (char) => '\\' + char));
  if (exceptUserId) q = q.neq('id', exceptUserId);
  const { data, error } = await q.limit(1);
  if (error) throw new AppError('SERVER_ERROR');
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

/** Explicit columns — never `*`: user_profiles also holds password_hash. */
const USER_COLUMNS = 'id, full_name, email, username, employee_id, department_id, role, is_active, must_change_password, auth_provider, created_at, updated_at';

export async function listUsers() {
  const { data, error } = await supabaseAdmin()
    .from('user_profiles')
    .select(USER_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export type PermissionPatch = {
  /** Permission catalog codes granted to this account. Only stored for role='user'. */
  permissions: string[];
  /** field_keys the user may edit. Only stored for role='user'. */
  editable_fields: string[];
};

export type CreateUserInput = PermissionPatch & {
  full_name: string;
  email: string;
  username: string;
  employee_id?: string | null;
  department_id?: string | null;
  role: Role;
  /** Set by the admin directly — never generated or shown back. */
  password: string;
};

/** Labels of Required fields this account couldn't fill — non-empty means
 *  it holds equipment.create but can't actually create equipment. */
export type AccessResult = { blocking_required_fields: string[] };

/** Creates the account and applies the permissions the admin chose for it. */
export async function createUser(input: CreateUserInput, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();

  if (await emailTaken(email)) throw new AppError('EMAIL_ALREADY_EXISTS');

  const username = normalizeUsername(input.username);
  if (!username) throw new AppError('VALIDATION_ERROR');
  const { data: conflicts, error: lookupError } = await db.from('user_profiles')
    .select('id').eq('username', username).limit(1);
  if (lookupError) throw new AppError('SERVER_ERROR');
  if (conflicts?.length) throw new AppError('USERNAME_ALREADY_EXISTS');

  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    if (authErr?.message?.toLowerCase().includes('already')) {
      throw new AppError('EMAIL_ALREADY_EXISTS');
    }
    throw new AppError('SERVER_ERROR', { stage: 'create_auth_user' });
  }

  const userId = created.user.id;

  // Profile + grants + audit in one transaction.
  const { data, error } = await db.rpc('admin_create_user', {
    p_actor: actor,
    p_id: userId,
    p_full_name: input.full_name.trim(),
    p_username: username,
    p_email: email,
    p_employee_id: input.employee_id ?? null,
    p_department_id: input.department_id ?? null,
    p_role: input.role,
    p_permissions: input.permissions,
    p_field_keys: input.editable_fields,
    p_request_id: reqId,
  });
  if (error) {
    // Không để lại auth user mồ côi không có profile — withAuth sẽ trả
    // UNAUTHORIZED và không ai gỡ được ngoài SQL tay.
    await db.auth.admin.deleteUser(userId).catch(() => {});
    throw identityConflict(error) ?? mapRpcError(error);
  }

  return { user_id: userId, email, username, ...(data as AccessResult) };
}

export async function setUserActive(
  userId: string, active: boolean, actor: string, reqId: string,
) {
  return rpc<{ id: string; is_active: boolean }>('admin_set_user_active', {
    p_actor: actor, p_user: userId, p_active: active, p_request_id: reqId,
  });
}

export type AccessPatch = {
  /** Omitted = keep the current role. */
  role?: Role;
  /** Omitted = keep the current grants. Only stored for role='user'. */
  permissions?: string[];
  editable_fields?: string[];
};

/** Role and permissions together, in one transaction — so demoting an admin
 *  to user and granting that user's permissions can't half-succeed. */
export async function setUserAccess(userId: string, patch: AccessPatch, actor: string, reqId: string) {
  return rpc<AccessResult & { user_id: string; role: Role; permissions: string[]; editable_fields: string[] }>(
    'admin_set_user_access', {
      p_actor: actor,
      p_user: userId,
      p_role: patch.role ?? null,
      p_permissions: patch.permissions ?? null,
      p_field_keys: patch.editable_fields ?? null,
      p_request_id: reqId,
    });
}

export type UserProfilePatch = {
  full_name: string;
  email: string | null;
  employee_id: string | null;
  department_id: string | null;
};

/** Admin edits someone's identity details. Username stays fixed (it's the
 *  sign-in name); for a Supabase account the email is its Supabase Auth
 *  login too, so it is changed there first and rolled back if the profile
 *  update then fails. */
export async function updateUserProfile(userId: string, patch: UserProfilePatch, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const { data: before, error: readErr } = await db.from('user_profiles')
    .select('full_name, email, employee_id, department_id, auth_provider').eq('id', userId).maybeSingle();
  if (readErr) throw new AppError('SERVER_ERROR');
  if (!before) throw new AppError('USER_NOT_FOUND');

  const next = {
    full_name: patch.full_name.trim(),
    email: patch.email?.trim().toLowerCase() || null,
    employee_id: patch.employee_id?.trim() || null,
    department_id: patch.department_id || null,
  };
  const isSupabase = before.auth_provider === 'supabase';
  if (isSupabase && !next.email) {
    throw new AppError('VALIDATION_ERROR', { fields: { email: 'required for a Supabase account (it is the login)' } });
  }

  const emailChanged = next.email !== before.email;
  if (emailChanged && next.email && await emailTaken(next.email, userId)) throw new AppError('EMAIL_ALREADY_EXISTS');

  if (isSupabase && emailChanged) {
    const { error } = await db.auth.admin.updateUserById(userId, { email: next.email!, email_confirm: true });
    if (error) {
      if (error.message?.toLowerCase().includes('already')) throw new AppError('EMAIL_ALREADY_EXISTS');
      throw new AppError('SERVER_ERROR', { stage: 'update_auth_email' });
    }
  }

  const { data, error } = await db.from('user_profiles').update(next).eq('id', userId)
    .select(USER_COLUMNS).maybeSingle();
  if (error) {
    if (isSupabase && emailChanged) {
      await db.auth.admin.updateUserById(userId, { email: before.email!, email_confirm: true }).catch(() => {});
    }
    throw identityConflict(error) ?? mapRpcError(error);
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  (Object.keys(next) as (keyof typeof next)[]).forEach((key) => {
    if (before[key] !== next[key]) changes[key] = { old: before[key], new: next[key] };
  });
  if (Object.keys(changes).length > 0) await audit('user', userId, 'USER_PROFILE_UPDATE', changes, actor, reqId);

  return data;
}

/** Admin sets someone else's real password directly — never generated,
 *  never shown back. Signs out every session that account had, and makes
 *  it pick its own password at next sign-in (the admin knows this one). */
export async function setUserPassword(userId: string, newPassword: string, actor: string, reqId: string) {
  // Checked before touching Supabase Auth — the RPC below also refuses, but
  // by then a Supabase account's password would already have changed.
  if (userId === actor) throw new AppError('CANNOT_MODIFY_SELF');

  const db = supabaseAdmin();
  const { data: account, error: lookupError } = await db.from('user_profiles')
    .select('auth_provider').eq('id', userId).maybeSingle();
  if (lookupError) throw new AppError('SERVER_ERROR');
  if (!account) throw new AppError('USER_NOT_FOUND');

  let passwordHash: string | null = null;
  if ((account as { auth_provider: string }).auth_provider === 'local') {
    passwordHash = await hashPassword(newPassword);
  } else {
    const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AppError('SERVER_ERROR', { stage: 'set_password' });
  }

  await rpc('admin_record_password_reset', {
    p_actor: actor, p_user: userId, p_password_hash: passwordHash, p_request_id: reqId,
  });
  return { user_id: userId };
}

// ---------------------------------------------------------------------------
// PERMISSIONS
// ---------------------------------------------------------------------------

export async function getPermissionCatalog() {
  const { data, error } = await supabaseAdmin()
    .from('permissions').select('*').order('display_order', { ascending: true });
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export async function getPermissionMatrix() {
  const db = supabaseAdmin();
  const [users, fieldPerms, userPerms] = await Promise.all([
    db.from('user_profiles')
      .select('id, full_name, email, username, employee_id, department_id, role, is_active, must_change_password, auth_provider')
      .order('full_name'),
    db.from('field_permissions').select('user_id, field_definitions!inner(field_key)').eq('can_edit', true),
    db.from('user_permissions').select('user_id, permission_code'),
  ]);
  // Fail loudly: an empty grant list on a failed read would show "no
  // permissions" in the editor, and saving from there would wipe them.
  for (const { error } of [users, fieldPerms, userPerms]) if (error) throw mapRpcError(error);

  const fieldsByUser = new Map<string, string[]>();
  for (const p of fieldPerms.data ?? []) {
    const row = p as { user_id: string; field_definitions: { field_key: string } | { field_key: string }[] };
    const key = Array.isArray(row.field_definitions) ? row.field_definitions[0]?.field_key : row.field_definitions?.field_key;
    if (!key) continue;
    fieldsByUser.set(row.user_id, [...(fieldsByUser.get(row.user_id) ?? []), key]);
  }
  const permsByUser = new Map<string, string[]>();
  for (const p of userPerms.data ?? []) {
    const row = p as { user_id: string; permission_code: string };
    permsByUser.set(row.user_id, [...(permsByUser.get(row.user_id) ?? []), row.permission_code]);
  }

  return (users.data ?? []).map((u) => {
    const row = u as { id: string };
    return { ...u, editable_fields: fieldsByUser.get(row.id) ?? [], permissions: permsByUser.get(row.id) ?? [] };
  });
}

// ---------------------------------------------------------------------------
// LOCATIONS
// ---------------------------------------------------------------------------

export async function listLocations(onlyActive: boolean) {
  let q = supabaseAdmin()
    .from('locations')
    .select('id, code, name, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });
  if (onlyActive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export async function createLocation(
  input: { code: string; name?: string | null; sort_order?: number },
  actor: string, reqId: string,
) {
  const { data, error } = await supabaseAdmin().from('locations').insert({
    code: input.code.trim(),
    name: input.name ?? null,
    sort_order: input.sort_order ?? 0,
  }).select().maybeSingle();
  if (error) throw mapRpcError(error);

  await audit('location', (data as { id: string }).id, 'LOCATION_CONFIG_UPDATE',
    { code: { old: null, new: input.code } }, actor, reqId);
  return data;
}

export async function updateLocation(
  id: string,
  patch: { code?: string; name?: string | null; sort_order?: number; is_active?: boolean },
  actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before } = await db.from('locations').select('*').eq('id', id).maybeSingle();
  if (!before) throw new AppError('VALIDATION_ERROR', { location_id: 'không tồn tại' });

  const { data, error } = await db.from('locations').update(patch).eq('id', id)
    .select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await audit('location', id, 'LOCATION_CONFIG_UPDATE', changes, actor, reqId);
  return data;
}

// ---------------------------------------------------------------------------
// FIELD DEFINITIONS
// ---------------------------------------------------------------------------

export async function updateFieldDefinition(
  fieldKey: string, patch: Record<string, unknown>, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before, error: readError } = await db
    .from('field_definitions').select('*').eq('field_key', fieldKey).maybeSingle();
  if (readError) throw mapRpcError(readError);
  if (!before) throw new AppError('VALIDATION_ERROR', { field_key: 'Unknown field.' });
  const clean: Record<string, unknown> = validateFieldConfigPatch(before as never, patch);

  clean.updated_by = actor;
  const { data, error } = await db.from('field_definitions')
    .update(clean).eq('field_key', fieldKey).select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === 'updated_by') continue;
    changes[k] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await audit('field', (data as { id: string }).id, 'FIELD_CONFIG_UPDATE', changes, actor, reqId);
  return data;
}

async function requireFieldDefinition(fieldKey: string) {
  const { data, error } = await supabaseAdmin().from('field_definitions')
    .select('id, is_system').eq('field_key', fieldKey).maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) throw new AppError('VALIDATION_ERROR', { field_key: 'Unknown field.' });
  return data as { id: string; is_system: boolean };
}

/** Số record đang thiếu giá trị — hiển thị trước khi Admin bật Required.
 *  A ref field (types/level/status) checks its real *_id column; a custom
 *  field checks inside the custom_fields jsonb blob instead. */
export async function countMissingValues(fieldKey: string): Promise<number> {
  const db = supabaseAdmin();
  const def = await requireFieldDefinition(fieldKey);

  if (!def.is_system) {
    const { count, error } = await db.from('equipment')
      .select('id', { count: 'exact', head: true })
      .filter(`custom_fields->>${fieldKey}`, 'is', null)
      .is('archived_at', null);
    if (error) throw mapRpcError(error);
    return count ?? 0;
  }

  const column = REF_FIELD_COLUMN[fieldKey] ?? fieldKey;
  const { count, error } = await db.from('equipment')
    .select('id', { count: 'exact', head: true })
    .is(column, null)
    .is('archived_at', null);
  if (error) throw mapRpcError(error);
  return count ?? 0;
}

/** Equipment rows (archived included) holding a value for a custom field —
 *  what deleting that field would erase. */
async function countFilledCustomValues(fieldKey: string): Promise<number> {
  const { count, error } = await supabaseAdmin().from('equipment')
    .select('id', { count: 'exact', head: true })
    .not(`custom_fields->>${fieldKey}`, 'is', null);
  if (error) throw mapRpcError(error);
  return count ?? 0;
}

export type BlockedCreator = { id: string; full_name: string; username: string };

/** Active role='user' accounts holding equipment.create that can't edit this
 *  field — if it is (or becomes) Required, none of them can create equipment. */
export async function listBlockedCreators(fieldKey: string): Promise<BlockedCreator[]> {
  return (await rpc<BlockedCreator[] | null>('admin_blocked_creators', { p_field_key: fieldKey })) ?? [];
}

/** Everything the Field configuration editor warns about for one field. */
export async function getFieldImpact(fieldKey: string) {
  const def = await requireFieldDefinition(fieldKey);
  const [missingCount, filledCount, blockedCreators] = await Promise.all([
    countMissingValues(fieldKey),
    def.is_system ? Promise.resolve(null) : countFilledCustomValues(fieldKey),
    listBlockedCreators(fieldKey),
  ]);
  return { field_key: fieldKey, missing_count: missingCount, filled_count: filledCount, blocked_creators: blockedCreators };
}

/** Grants edit permission on this field to every account listBlockedCreators
 *  returns. Admin-only at the route: it changes other users' permissions. */
export async function grantFieldEditToBlockedCreators(fieldKey: string, actor: string, reqId: string) {
  return rpc<{ field_key: string; granted_users: number }>('admin_grant_field_edit', {
    p_actor: actor, p_field_key: fieldKey, p_request_id: reqId,
  });
}

/** Creates a true admin-created custom field — never a system field, never
 *  one of the four *_ref input types (those are reserved for Type/Status/
 *  Level/Location, each backed by its own master-data table). */
export async function createCustomField(
  input: ReturnType<typeof validateCreateCustomField>, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('field_definitions').insert({
    field_key: input.field_key,
    display_label: input.display_label,
    data_type: input.data_type,
    input_type: input.input_type,
    is_required: input.is_required,
    is_visible: input.is_visible,
    display_order: input.display_order,
    max_length: input.max_length,
    help_text: input.help_text,
    placeholder: input.placeholder,
    is_system: false,
    updated_by: actor,
  }).select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new AppError('VALIDATION_ERROR', { fields: { field_key: 'This key is already in use.' } });
    throw mapRpcError(error);
  }
  await audit('field', (data as { id: string }).id, 'FIELD_CONFIG_UPDATE',
    { field_key: { old: null, new: input.field_key } }, actor, reqId);
  return data;
}

/** Custom fields only — a system field can never be removed (structural
 *  code throughout the app depends on it existing). One transaction strips
 *  the key from every equipment row and deletes the definition; the removed
 *  values are kept in the audit row. */
export async function deleteCustomField(fieldKey: string, actor: string, reqId: string) {
  return rpc<{ field_key: string; cleared_records: number }>('admin_delete_custom_field', {
    p_actor: actor, p_field_key: fieldKey, p_request_id: reqId,
  });
}

// ---------------------------------------------------------------------------
// FIELD OPTIONS — custom dropdown fields only
// ---------------------------------------------------------------------------

/** Resolves a field_key to its field_definitions id, rejecting anything
 *  that isn't a custom dropdown field — options only ever apply there. */
export async function resolveCustomDropdownFieldId(fieldKey: string): Promise<string> {
  const { data } = await supabaseAdmin().from('field_definitions')
    .select('id, input_type, is_system').eq('field_key', fieldKey).maybeSingle();
  const row = data as { id: string; input_type: string; is_system: boolean } | null;
  if (!row) throw new AppError('VALIDATION_ERROR', { field_key: 'Unknown field.' });
  if (row.input_type !== 'dropdown' || row.is_system) {
    throw new AppError('VALIDATION_ERROR', { field_key: 'Options only apply to custom dropdown fields.' });
  }
  return row.id;
}

export async function listFieldOptions(fieldDefinitionId: string) {
  const { data, error } = await supabaseAdmin().from('field_options')
    .select('*').eq('field_definition_id', fieldDefinitionId).order('display_order', { ascending: true });
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export async function createFieldOption(
  fieldDefinitionId: string, input: { value: string; label: string; display_order?: number },
  actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('field_options').insert({
    field_definition_id: fieldDefinitionId,
    value: input.value.trim(), label: input.label.trim(),
    display_order: input.display_order ?? 0,
    created_by: actor, updated_by: actor,
  }).select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new AppError('VALIDATION_ERROR', { fields: { value: 'This value already exists for this field.' } });
    throw mapRpcError(error);
  }
  await audit('field', fieldDefinitionId, 'FIELD_CONFIG_UPDATE',
    { option_added: { old: null, new: input.value } }, actor, reqId);
  return data;
}

/** `fieldDefinitionId` scopes the update to that field's own options, so an
 *  option id from another field in the URL can't be edited through it. */
export async function updateFieldOption(
  fieldDefinitionId: string, optionId: string,
  patch: { label?: string; display_order?: number; is_active?: boolean },
  actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before, error: readErr } = await db.from('field_options').select('*')
    .eq('id', optionId).eq('field_definition_id', fieldDefinitionId).maybeSingle();
  if (readErr) throw mapRpcError(readErr);
  if (!before) throw new AppError('VALIDATION_ERROR', { option_id: 'không tồn tại' });

  const { data, error } = await db.from('field_options')
    .update({ ...patch, updated_by: actor }).eq('id', optionId).select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[`option.${(before as { value: string }).value}.${k}`] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await audit('field', fieldDefinitionId, 'FIELD_CONFIG_UPDATE', changes, actor, reqId);
  return data;
}

// ---------------------------------------------------------------------------
// ERROR LOG
// ---------------------------------------------------------------------------

/** Latest errors, or — with `requestId` — every error whose request_id
 *  contains it, however old (within the 90-day retention): the id a user
 *  reads off their error screen is usually reported long after 200 newer
 *  errors have been logged. */
export async function listRecentErrors(limit = 50, requestId?: string) {
  let q = supabaseAdmin()
    .from('error_log')
    .select('id, request_id, route, user_id, error_code, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  const needle = requestId?.trim();
  if (needle) q = q.ilike('request_id', `%${needle.replace(/[%_\\]/g, (char) => '\\' + char)}%`);
  const { data, error } = await q;
  if (error) throw mapRpcError(error);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// AUDIT LOG — admin-side changes (users, permissions, fields, master data)
// ---------------------------------------------------------------------------

export const ADMIN_AUDIT_ENTITIES = [
  'user', 'field', 'location', 'equipment_type', 'equipment_status', 'equipment_level', 'department', 'permission',
] as const;
export type AdminAuditEntity = typeof ADMIN_AUDIT_ENTITIES[number];

/** Where to find a readable name for each entity type's entity_id. */
const ENTITY_LABEL: Partial<Record<AdminAuditEntity, { table: string; column: string }>> = {
  user: { table: 'user_profiles', column: 'username' },
  field: { table: 'field_definitions', column: 'field_key' },
  location: { table: 'locations', column: 'code' },
  equipment_type: { table: 'equipment_types', column: 'code' },
  equipment_status: { table: 'equipment_statuses', column: 'code' },
  equipment_level: { table: 'equipment_levels', column: 'code' },
  department: { table: 'departments', column: 'code' },
};

type AuditRow = {
  id: string; entity_type: AdminAuditEntity; entity_id: string | null; action: string;
  changes: Record<string, unknown>; changed_by: string | null; created_at: string;
  request_id: string | null; note: string | null;
};

export async function listAdminAudit(opts: { entityType?: AdminAuditEntity; limit: number; before?: string }) {
  const db = supabaseAdmin();
  let q = db.from('audit_log')
    .select('id, entity_type, entity_id, action, changes, changed_by, created_at, request_id, note')
    .in('entity_type', opts.entityType ? [opts.entityType] : [...ADMIN_AUDIT_ENTITIES])
    .order('created_at', { ascending: false })
    .limit(opts.limit);
  // Inclusive: one transaction can write many rows with the same created_at
  // (e.g. a field-edit grant to 20 users), and a strict `<` would skip the
  // ones past a page boundary. The client drops the repeats by id.
  if (opts.before) q = q.lte('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw mapRpcError(error);
  const rows = (data ?? []) as AuditRow[];

  // One lookup per referenced table instead of one per row.
  const labels = new Map<string, string>();
  const actorIds = rows.map((r) => r.changed_by).filter((id): id is string => !!id);
  const lookups: Promise<void>[] = [];
  const byTable = new Map<string, { column: string; ids: Set<string> }>();
  byTable.set('user_profiles', { column: 'username', ids: new Set(actorIds) });
  for (const row of rows) {
    const target = ENTITY_LABEL[row.entity_type];
    if (!target || !row.entity_id) continue;
    const entry = byTable.get(target.table) ?? { column: target.column, ids: new Set<string>() };
    entry.ids.add(row.entity_id);
    byTable.set(target.table, entry);
  }
  for (const [table, { column, ids }] of byTable) {
    if (ids.size === 0) continue;
    lookups.push((async () => {
      const { data: found } = await db.from(table).select(`id, ${column}`).in('id', [...ids]);
      for (const r of (found ?? []) as unknown as Record<string, string>[]) labels.set(`${table}:${r.id}`, r[column] ?? '');
    })());
  }
  await Promise.all(lookups);

  return rows.map((row) => {
    const target = ENTITY_LABEL[row.entity_type];
    return {
      ...row,
      actor_username: row.changed_by ? labels.get(`user_profiles:${row.changed_by}`) ?? null : null,
      entity_label: target && row.entity_id ? labels.get(`${target.table}:${row.entity_id}`) ?? null : null,
    };
  });
}
