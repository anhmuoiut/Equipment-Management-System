// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';

const nav = vi.hoisted(() => ({ pathname: '/admin/master-data' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { AdminNav } from './AdminNav';
import { AdminAccessProvider } from './AdminAccessContext';
import type { Role } from '@/lib/permissions';

function renderNav(role: Role, permissions: string[] = []) {
  return render(
    <AdminAccessProvider value={{ userId: 'u1', role, permissions }}>
      <AdminNav />
    </AdminAccessProvider>,
  );
}

beforeEach(() => { nav.pathname = '/admin/master-data'; });

it('tabs between the pages of the current category only', () => {
  renderNav('admin');
  const strip = screen.getByRole('navigation', { name: 'nav.configuration' });
  const tabs = strip.querySelectorAll('a');
  expect([...tabs].map((a) => a.getAttribute('href'))).toEqual(['/admin/master-data', '/admin/calibration-settings']);
  expect(screen.getByRole('link', { name: 'nav.masterData' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'nav.calibrationSettings' }).getAttribute('aria-current')).toBeNull();
});

it('pairs Audit log with Error log under System logs', () => {
  nav.pathname = '/admin/errors';
  renderNav('admin');
  screen.getByRole('navigation', { name: 'nav.systemLogs' });
  expect(screen.getByRole('link', { name: 'nav.errorLog' }).getAttribute('aria-current')).toBe('page');
});

it('renders nothing for a single-page category', () => {
  nav.pathname = '/admin/users';
  const { container } = renderNav('admin');
  expect(container.innerHTML).toBe('');
});
