'use client';

/**
 * Tabs between the sections of the current Administration category (e.g.
 * Configuration → Master data | Calibration settings). The sidebar lists
 * categories only, so this strip is the one place a category's second
 * section is reached from — shown at every width. Plain links with
 * aria-current, not role="tablist": each tab is its own page.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ADMIN_SECTION_PATHS, accessibleAdminCategories, adminCategoryOf, adminSectionAt,
} from '@/lib/permissions';
import { useAdminAccess } from '@/components/admin/AdminAccessContext';
import { ADMIN_CATEGORY_NAV, ADMIN_SECTION_LABEL_KEYS } from '@/components/admin/adminNavigation';

export function AdminNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { role, permissions } = useAdminAccess();
  const current = adminSectionAt(pathname);
  if (!current) return null;
  const category = adminCategoryOf(current);
  const sections = accessibleAdminCategories(role, permissions)
    .find((entry) => entry.category === category)?.sections ?? [];
  // A single tab is just noise — the page heading already names the section.
  if (sections.length < 2) return null;
  return (
    <nav className="admin-tabs" aria-label={t(ADMIN_CATEGORY_NAV[category].labelKey)}>
      {sections.map((section) => {
        const href = ADMIN_SECTION_PATHS[section];
        const active = section === current;
        return (
          <Link
            key={section}
            href={href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="admin-tab"
          >
            {t(ADMIN_SECTION_LABEL_KEYS[section])}
          </Link>
        );
      })}
    </nav>
  );
}
