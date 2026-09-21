import 'server-only';

/**
 * Admin service — V2.
 *
 * Admin-created accounts (this file) use real Supabase Auth — an email +
 * a password the admin sets directly, mainly for admins themselves. Regular
 * users can also self-request an account (`lib/services/signup.ts`) with a
 * username and password stored and verified by this app directly
 * (`auth_provider = 'local'`, see `lib/auth/password.ts`); those requests
 * land inactive and are approved the same way any deactivated account is
 * reactivated here. `setUserPassword` below handles both kinds.
 *
 * Permission is assigned one-by-one per user: an explicit list of
 * permission catalog codes (equipment.create, calibration.view, …) plus an
 * explicit list of field_keys the user may edit — no fixed presets. Admin
 * bypasses all of this regardless of what's stored on the row.
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

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

export async function listUsers() {
  const { data, error } = await supabaseAdmin()
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export type PermissionPatch = {
  /** Permission catalog codes granted to this account. Ignored for role='admin'. */
  permissions: string[];
  /** field_keys the user may edit. Ignored entirely for role='admin'. */
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

/** Creates the account and applies the permissions the admin chose for it. */
export async function createUser(input: CreateUserInput, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();

  const { data: existing, error: emailError } = await db
    .from('user_profiles')
    .select('id')
    .ilike('email', email.replace(/[%_\\]/g, char => '\\' + char))
    .maybeSingle();
  if (emailError) throw new AppError('SERVER_ERROR');
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS');

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

  const { error: profErr } = await db.from('user_profiles').insert({
    id: userId,
    full_name: input.full_name.trim(),
    username,
    email,
    employee_id: input.employee_id ?? null,
    department_id: input.department_id ?? null,
    role: input.role,
    is_active: true,
    must_change_password: true,
    auth_provider: 'supabase',
  });
  if (profErr) {
    // Không để lại auth user mồ côi không có profile — withAuth sẽ trả
    // UNAUTHORIZED và không ai gỡ được ngoài SQL tay.
    await db.auth.admin.deleteUser(userId).catch(() => {});
    if (profErr.code === '23505' && profErr.message.includes('uq_user_profiles_username')) {
      throw new AppError('USERNAME_ALREADY_EXISTS');
    }
    throw mapRpcError(profErr);
  }

  await setUserPermissions(userId, {
    permissions: input.role === 'admin' ? [] : input.permissions,
    editable_fields: input.role === 'admin' ? [] : input.editable_fields,
  }, actor, reqId);
  await audit('user', userId, 'USER_CREATE',
    { role: { old: null, new: input.role }, editable_fields: { old: null, new: input.editable_fields } },
    actor, reqId);

  return { user_id: userId, email, username };
}

export async function setUserActive(
  userId: string, active: boolean, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('user_profiles')
    .update({ is_active: active })
    .eq('id', userId)
    .select('id, is_active')
    .maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) throw new AppError('VALIDATION_ERROR', { user_id: 'không tồn tại' });

  await audit('user', userId, active ? 'USER_REACTIVATE' : 'USER_DEACTIVATE',
    { is_active: { old: !active, new: active } }, actor, reqId);
  return data;
}

export async function setUserRole(userId: string, role: Role, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const { data: before } = await db
    .from('user_profiles').select('role').eq('id', userId).maybeSingle();
  if (!before) throw new AppError('VALIDATION_ERROR', { user_id: 'không tồn tại' });

  const { error } = await db.from('user_profiles').update({ role }).eq('id', userId);
  if (error) throw mapRpcError(error);

  await audit('user', userId, 'FIELD_PERMISSION_UPDATE',
    { role: { old: (before as { role: string }).role, new: role } }, actor, reqId);
  return { user_id: userId, role };
}

/** Admin sets the account's real password directly — never generated, never shown back. */
export async function setUserPassword(userId: string, newPassword: string, actor: string, reqId: string) {
  const db = supabaseAdmin();

  const { data: account, error: lookupError } = await db.from('user_profiles')
    .select('auth_provider, token_version').eq('id', userId).maybeSingle();
  if (lookupError) throw new AppError('SERVER_ERROR');
  if (!account) throw new AppError('VALIDATION_ERROR', { user_id: 'không tồn tại' });

  if ((account as { auth_provider: string }).auth_provider === 'local') {
    const password_hash = await hashPassword(newPassword);
    // Bumping token_version signs out any session cookie issued with the old password.
    const nextTokenVersion = (account as { token_version: number }).token_version + 1;
    const { error: updErr } = await db.from('user_profiles')
      .update({ password_hash, must_change_password: true, token_version: nextTokenVersion })
      .eq('id', userId);
    if (updErr) throw mapRpcError(updErr);
  } else {
    const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new AppError('SERVER_ERROR', { stage: 'set_password' });
    await db.from('user_profiles').update({ must_change_password: true }).eq('id', userId);
  }

  await audit('user', userId, 'USER_PASSWORD_CHANGE', { password_changed: { old: null, new: true } },
    actor, reqId);

  return { user_id: userId };
}

// ---------------------------------------------------------------------------
// PERMISSIONS
// ---------------------------------------------------------------------------

/** Applies exactly the permission codes + field permissions the admin
 *  chose, one by one — no presets. */
export async function setUserPermissions(
  userId: string, patch: PermissionPatch, actor: string, reqId: string,
) {
  const db = supabaseAdmin();

  const { data: defs, error: defErr } = await db
    .from('field_definitions').select('id, field_key');
  if (defErr) throw mapRpcError(defErr);

  const idByKey = new Map((defs ?? []).map((d) => [(d as { field_key: string }).field_key, (d as { id: string }).id]));
  const grantedKeys = patch.editable_fields.filter((k) => idByKey.has(k));

  const { error: delFieldErr } = await db.from('field_permissions').delete().eq('user_id', userId);
  if (delFieldErr) throw mapRpcError(delFieldErr);
  if (grantedKeys.length > 0) {
    const { error: insErr } = await db.from('field_permissions').insert(
      grantedKeys.map((field_key) => ({
        user_id: userId, field_definition_id: idByKey.get(field_key)!, can_edit: true, updated_by: actor,
      })),
    );
    if (insErr) throw mapRpcError(insErr);
  }

  const { data: catalog, error: catErr } = await db.from('permissions').select('code');
  if (catErr) throw mapRpcError(catErr);
  const validCodes = new Set((catalog ?? []).map((c) => (c as { code: string }).code));
  const grantedCodes = patch.permissions.filter((c) => validCodes.has(c));

  const { error: delPermErr } = await db.from('user_permissions').delete().eq('user_id', userId);
  if (delPermErr) throw mapRpcError(delPermErr);
  if (grantedCodes.length > 0) {
    const { error: insPermErr } = await db.from('user_permissions').insert(
      grantedCodes.map((permission_code) => ({ user_id: userId, permission_code, granted_by: actor })),
    );
    if (insPermErr) throw mapRpcError(insPermErr);
  }

  await audit('user', userId, 'FIELD_PERMISSION_UPDATE', {
    permissions: { old: null, new: grantedCodes },
    editable_fields: { old: null, new: grantedKeys },
  }, actor, reqId);

  // Cảnh báo bẫy Required × Permission: nếu user không có quyền nhập field
  // đang Required thì sẽ không tạo được equipment nào.
  const { data: requiredDefs } = await db
    .from('field_definitions').select('field_key, display_label').eq('is_required', true);
  const blocking = (requiredDefs ?? [])
    .filter((d) => !grantedKeys.includes((d as { field_key: string }).field_key))
    .map((d) => (d as { display_label: string }).display_label);

  return {
    user_id: userId,
    granted_fields: grantedKeys,
    granted_permissions: grantedCodes,
    warning: grantedCodes.includes('equipment.create') && blocking.length > 0
      ? `These permissions don't cover ${blocking.length} Required field(s) (${blocking.join(', ')}) → this user won't be able to create equipment.`
      : null,
  };
}

export async function getPermissionCatalog() {
  const { data, error } = await supabaseAdmin()
    .from('permissions').select('*').order('display_order', { ascending: true });
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export async function getPermissionMatrix() {
  const db = supabaseAdmin();
  const [{ data: users }, { data: fieldPerms }, { data: userPerms }] = await Promise.all([
    db.from('user_profiles')
      .select('id, full_name, email, username, role, is_active, auth_provider')
      .order('full_name'),
    db.from('field_permissions').select('user_id, field_definitions!inner(field_key)').eq('can_edit', true),
    db.from('user_permissions').select('user_id, permission_code'),
  ]);

  const fieldsByUser = new Map<string, string[]>();
  for (const p of fieldPerms ?? []) {
    const row = p as { user_id: string; field_definitions: { field_key: string } | { field_key: string }[] };
    const key = Array.isArray(row.field_definitions) ? row.field_definitions[0]?.field_key : row.field_definitions?.field_key;
    if (!key) continue;
    fieldsByUser.set(row.user_id, [...(fieldsByUser.get(row.user_id) ?? []), key]);
  }
  const permsByUser = new Map<string, string[]>();
  for (const p of userPerms ?? []) {
    const row = p as { user_id: string; permission_code: string };
    permsByUser.set(row.user_id, [...(permsByUser.get(row.user_id) ?? []), row.permission_code]);
  }

  return (users ?? []).map((u) => {
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

/** Số record đang thiếu giá trị — hiển thị trước khi Admin bật Required.
 *  A ref field (types/level/status) checks its real *_id column; a custom
 *  field checks inside the custom_fields jsonb blob instead. */
export async function countMissingValues(fieldKey: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: def } = await db.from('field_definitions').select('is_system').eq('field_key', fieldKey).maybeSingle();
  const isSystem = (def as { is_system: boolean } | null)?.is_system ?? true;

  if (!isSystem) {
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
 *  code throughout the app depends on it existing). Deletes the column's
 *  values from every equipment.custom_fields row too, so nothing orphaned
 *  lingers once the field itself is gone. */
export async function deleteCustomField(fieldKey: string, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const { data: def, error: readErr } = await db.from('field_definitions')
    .select('id, is_system').eq('field_key', fieldKey).maybeSingle();
  if (readErr) throw mapRpcError(readErr);
  if (!def) throw new AppError('VALIDATION_ERROR', { field_key: 'Unknown field.' });
  if ((def as { is_system: boolean }).is_system) throw new AppError('FORBIDDEN', { field_key: 'System fields cannot be deleted.' });

  const { error: delErr } = await db.from('field_definitions').delete().eq('id', (def as { id: string }).id);
  if (delErr) throw mapRpcError(delErr);

  const { data: rows } = await db.from('equipment').select('id, custom_fields').not('custom_fields', 'eq', '{}');
  for (const row of (rows ?? []) as { id: string; custom_fields: Record<string, unknown> }[]) {
    if (!(fieldKey in row.custom_fields)) continue;
    const next = { ...row.custom_fields };
    delete next[fieldKey];
    await db.from('equipment').update({ custom_fields: next }).eq('id', row.id);
  }

  await audit('field', (def as { id: string }).id, 'FIELD_CONFIG_UPDATE',
    { field_key: { old: fieldKey, new: null } }, actor, reqId);
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

export async function updateFieldOption(
  optionId: string, patch: { label?: string; display_order?: number; is_active?: boolean },
  actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before } = await db.from('field_options').select('*').eq('id', optionId).maybeSingle();
  if (!before) throw new AppError('VALIDATION_ERROR', { option_id: 'không tồn tại' });

  const { data, error } = await db.from('field_options')
    .update({ ...patch, updated_by: actor }).eq('id', optionId).select().maybeSingle();
  if (error) throw mapRpcError(error);

  await audit('field', (before as { field_definition_id: string }).field_definition_id, 'FIELD_CONFIG_UPDATE',
    { option: { old: (before as { value: string }).value, new: patch } }, actor, reqId);
  return data;
}

// ---------------------------------------------------------------------------
// ERROR LOG
// ---------------------------------------------------------------------------

export async function listRecentErrors(limit = 50) {
  const { data, error } = await supabaseAdmin()
    .from('error_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw mapRpcError(error);
  return data ?? [];
}
