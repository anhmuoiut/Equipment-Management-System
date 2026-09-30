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
  | 'master_data.manage' | 'field.manage';

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

/**
 * Admin screens. Users, Error log and Audit log are role=admin only —
 * granting accounts/permissions is privilege-escalation-sensitive and is
 * deliberately never delegated. Master data, Calibration settings and Field
 * configuration can be delegated with master_data.manage / field.manage.
 * Shared by the server layouts (redirects), the sidebar and the admin tab
 * bar, so a delegated user never sees a link to a section that would only
 * answer 403.
 */
export type AdminSection = 'users' | 'masterData' | 'calibrationSettings' | 'fields' | 'audit' | 'errors';

/** Key order is the sidebar's order (ADMIN_CATEGORIES flattened), so /admin
 *  lands on the first item the sidebar shows this account. */
export const ADMIN_SECTION_PATHS: Record<AdminSection, string> = {
  users: '/admin/users',
  masterData: '/admin/master-data',
  calibrationSettings: '/admin/calibration-settings',
  fields: '/admin/fields',
  audit: '/admin/audit',
  errors: '/admin/errors',
};

/**
 * How the sidebar groups the sections: one collapsible Administration item
 * whose categories are its only level. A category holding several sections
 * switches between them with the page's own tab strip (AdminNav) instead of
 * a third sidebar tier.
 */
export type AdminCategory = 'users' | 'configuration' | 'fields' | 'logs';

export const ADMIN_CATEGORIES: readonly { category: AdminCategory; sections: readonly AdminSection[] }[] = [
  { category: 'users', sections: ['users'] },
  { category: 'configuration', sections: ['masterData', 'calibrationSettings'] },
  { category: 'fields', sections: ['fields'] },
  { category: 'logs', sections: ['audit', 'errors'] },
];

export function canAccessAdminSection(role: Role, permissions: readonly string[], section: AdminSection): boolean {
  if (role === 'admin') return true;
  if (role === 'viewer') return false;
  // The Due Soon window is master-data-managed: its PUT requires master_data.manage.
  if (section === 'masterData' || section === 'calibrationSettings') return permissions.includes('master_data.manage');
  if (section === 'fields') return permissions.includes('field.manage');
  return false;
}

/** Where /admin should land for this account, or null if nowhere. */
export function firstAdminSection(role: Role, permissions: readonly string[]): AdminSection | null {
  return (Object.keys(ADMIN_SECTION_PATHS) as AdminSection[])
    .find((section) => canAccessAdminSection(role, permissions, section)) ?? null;
}

/** The categories this account can open, each narrowed to its accessible
 *  sections — a category with none is left out entirely. */
export function accessibleAdminCategories(
  role: Role, permissions: readonly string[],
): { category: AdminCategory; sections: AdminSection[] }[] {
  return ADMIN_CATEGORIES
    .map(({ category, sections }) => ({
      category,
      sections: sections.filter((section) => canAccessAdminSection(role, permissions, section)),
    }))
    .filter(({ sections }) => sections.length > 0);
}

/** The admin section a pathname is on, or null outside the admin screens. */
export function adminSectionAt(pathname: string): AdminSection | null {
  return (Object.keys(ADMIN_SECTION_PATHS) as AdminSection[]).find((section) => {
    const path = ADMIN_SECTION_PATHS[section];
    return pathname === path || pathname.startsWith(`${path}/`);
  }) ?? null;
}

export function adminCategoryOf(section: AdminSection): AdminCategory {
  const entry = ADMIN_CATEGORIES.find(({ sections }) => sections.includes(section));
  if (!entry) throw new Error(`Admin section without a category: ${section}`);
  return entry.category;
}

/** Restore là Admin-only, không có permission code riêng. */
export function canRestore(p: UserProfile): boolean {
  return isAdmin(p);
}

/** hasPermission's rule for callers that hold only the role and the grant
 *  list (the sidebar, page layouts) rather than a full profile. */
export function roleHasPermission(role: Role, permissions: readonly string[], code: PermissionCode | string): boolean {
  if (role === 'admin') return true;
  // "Viewer chỉ xem": a viewer never needs an explicit grant for a read-only
  // ('.view') code — the same exception History has always had — but is
  // still hard-blocked from every mutating code, same as V1.
  if (role === 'viewer') return code.endsWith('.view');
  return permissions.includes(code);
}

export function hasPermission(p: UserProfile, code: PermissionCode | string): boolean {
  return roleHasPermission(p.role, p.permissions, code);
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
