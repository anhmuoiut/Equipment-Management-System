/**
 * Kiểm tra quyền — V2.
 *
 * Nguyên tắc (unchanged from V1):
 *   - Mọi user đã đăng nhập XEM ĐƯỢC mọi field is_visible.
 *     field_permissions chỉ quyết định quyền SỬA.
 *   - Admin toàn quyền, không phụ thuộc permission catalog hay field_permissions.
 *   - Viewer chỉ xem.
 *   - Không có record trong field_permissions → deny.
 *
 * What's new in V2: the four fixed can_create/can_move/can_detach/can_archive
 * booleans are gone. Action permission is now an open-ended catalog
 * (`permissions` table + `user_permissions` grants) — a permission is just a
 * string code ('equipment.create', 'calibration.view', …) an account either
 * holds or doesn't. Adding a new gate anywhere in the app is a catalog row
 * plus a `hasPermission` check, never a new column.
 */
import { AppError } from '@/lib/errors';

export type Role = 'admin' | 'user' | 'viewer';

/** Catalog codes currently checked anywhere in the app. Not an exhaustive
 *  list of every row in `permissions` (the catalog can grow via seed data
 *  alone), just the ones application code actually gates on — kept as a
 *  union for editor autocomplete / typo safety at call sites. */
export type PermissionCode =
  | 'equipment.create' | 'equipment.move' | 'equipment.detach' | 'equipment.archive'
  | 'repair.view' | 'repair.create' | 'repair.update'
  | 'calibration.view' | 'calibration.create' | 'calibration.update'
  | 'master_data.manage' | 'field.manage' | 'user.manage';

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  username: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  /** Permission codes granted to this account. Meaningless for role='admin',
   *  which bypasses every check regardless of what's in here. */
  permissions: string[];
};

export function isAdmin(p: UserProfile): boolean {
  return p.role === 'admin';
}

/** Restore là Admin-only, không có permission code riêng. */
export function canRestore(p: UserProfile): boolean {
  return isAdmin(p);
}

export function hasPermission(p: UserProfile, code: PermissionCode | string): boolean {
  if (isAdmin(p)) return true;
  // "Viewer chỉ xem": a viewer never needs an explicit grant for a read-only
  // ('.view') code — the same exception History has always had — but is
  // still hard-blocked from every mutating code, same as V1.
  if (p.role === 'viewer') return code.endsWith('.view');
  return p.permissions.includes(code);
}

export function assertPermission(p: UserProfile, code: PermissionCode | string): void {
  if (!hasPermission(p, code)) throw new AppError('FORBIDDEN', { action: code });
}

/**
 * Trả về các field trong payload mà user KHÔNG có quyền sửa.
 * editableFields = danh sách field_key có can_edit = true của user đó.
 */
export function deniedFields(
  p: UserProfile,
  payloadKeys: readonly string[],
  editableFields: readonly string[],
): string[] {
  if (isAdmin(p)) return [];
  if (p.role === 'viewer') return [...payloadKeys];
  const allowed = new Set(editableFields);
  return payloadKeys.filter((k) => !allowed.has(k));
}

export function assertFields(
  p: UserProfile,
  payloadKeys: readonly string[],
  editableFields: readonly string[],
): void {
  const denied = deniedFields(p, payloadKeys, editableFields);
  if (denied.length > 0) {
    throw new AppError('FIELD_PERMISSION_DENIED', { denied_fields: denied });
  }
}
