'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

const ITEMS = [
  { href: '/admin/users', key: 'nav.usersPermissions' },
  { href: '/admin/master-data', key: 'nav.masterData' },
  { href: '/admin/fields', key: 'nav.fieldConfiguration' },
  { href: '/admin/errors', key: 'nav.errorLog' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  return (
    <nav className="admin-tabs" aria-label={t('nav.administrationSections')}>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-active={pathname === item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
          className="admin-tab"
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
