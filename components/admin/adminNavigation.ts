/**
 * Names and icons for the Administration navigation — shared by the
 * sidebar (one entry per category) and AdminNav (one tab per section
 * inside the current category). Which sections exist, their order and who
 * may open them live in lib/permissions; this is only how they're shown.
 */
import { ListTree, ScrollText, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import type { AdminCategory, AdminSection } from '@/lib/permissions';

export const ADMIN_CATEGORY_NAV: Record<AdminCategory, { labelKey: string; icon: LucideIcon }> = {
  users: { labelKey: 'nav.userManagement', icon: Users },
  configuration: { labelKey: 'nav.configuration', icon: SlidersHorizontal },
  fields: { labelKey: 'nav.fieldManagement', icon: ListTree },
  logs: { labelKey: 'nav.systemLogs', icon: ScrollText },
};

export const ADMIN_SECTION_LABEL_KEYS: Record<AdminSection, string> = {
  users: 'nav.usersPermissions',
  masterData: 'nav.masterData',
  calibrationSettings: 'nav.calibrationSettings',
  fields: 'nav.fieldConfiguration',
  audit: 'nav.auditLog',
  errors: 'nav.errorLog',
};
