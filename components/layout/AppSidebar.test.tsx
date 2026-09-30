// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { AppSidebar } from './AppSidebar';

function renderSidebar(role: 'admin' | 'user' | 'viewer', permissions: string[] = []) {
  return render(
    <AppSidebar role={role} permissions={permissions} collapsed={false} onToggleCollapse={() => {}} onNavigate={() => {}} />,
  );
}
const adminToggle = () => screen.getByRole('button', { name: 'nav.adminMenu' });
const adminPanel = () => document.getElementById('sidebar-admin-panel')!;

beforeEach(() => { nav.pathname = '/'; });

describe('AppSidebar — workspace', () => {
  it('lists Archived equipment as a peer of the Masterlist, plus Calibration and Golden master', () => {
    renderSidebar('admin');
    const main = screen.getByRole('navigation', { name: 'nav.mainNavigation' });
    const links = within(main).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/equipment', '/equipment/archived', '/calibration', '/golden-master']);
    const archived = within(main).getByRole('link', { name: 'nav.archivedEquipment' });
    expect(archived.className).toBe(within(main).getByRole('link', { name: 'nav.equipmentMasterlist' }).className);
    expect(within(main).getByRole('link', { name: 'nav.goldenMasterList (nav.soon)' })).toBeTruthy();
  });

  it('shows Calibration only to accounts holding calibration.view', () => {
    renderSidebar('user');
    expect(screen.queryByRole('link', { name: 'nav.calibration' })).toBeNull();
    screen.getByRole('link', { name: 'nav.goldenMasterList (nav.soon)' });
  });

  it('gives a viewer Calibration (every .view code) and no Administration', () => {
    renderSidebar('viewer');
    screen.getByRole('link', { name: 'nav.calibration' });
    expect(screen.queryByRole('button', { name: 'nav.adminMenu' })).toBeNull();
  });
});

describe('AppSidebar — Administration group', () => {
  it('starts closed outside the admin area and opens on click to four categories', () => {
    renderSidebar('admin');
    expect(adminToggle().getAttribute('aria-expanded')).toBe('false');
    expect(adminToggle().getAttribute('aria-controls')).toBe('sidebar-admin-panel');
    expect(adminPanel().inert).toBe(true);

    fireEvent.click(adminToggle());
    expect(adminToggle().getAttribute('aria-expanded')).toBe('true');
    expect(adminPanel().inert).toBe(false);
    const links = within(adminPanel()).getAllByRole('link');
    expect(links.map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['nav.userManagement', '/admin/users'],
      ['nav.configuration', '/admin/master-data'],
      ['nav.fieldManagement', '/admin/fields'],
      ['nav.systemLogs', '/admin/audit'],
    ]);
  });

  it('opens on an admin page and marks the category of the current page', () => {
    nav.pathname = '/admin/calibration-settings';
    renderSidebar('admin');
    expect(adminToggle().getAttribute('aria-expanded')).toBe('true');
    // The category links to Master data, so on its sibling page it's the current item, not page.
    expect(screen.getByRole('link', { name: 'nav.configuration' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: 'nav.userManagement' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks the exact page, and moves the marker to the toggle when the group is closed', () => {
    nav.pathname = '/admin/master-data';
    renderSidebar('admin');
    expect(screen.getByRole('link', { name: 'nav.configuration' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(adminToggle());
    expect(adminToggle().getAttribute('aria-expanded')).toBe('false');
    expect(adminToggle().getAttribute('data-current')).toBe('true');
  });

  it('opens when navigation arrives in the admin area', () => {
    const view = renderSidebar('admin');
    expect(adminToggle().getAttribute('aria-expanded')).toBe('false');
    nav.pathname = '/admin/users';
    view.rerender(<AppSidebar role="admin" permissions={[]} collapsed={false} onToggleCollapse={() => {}} onNavigate={() => {}} />);
    expect(adminToggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a delegated field manager only Field management', () => {
    renderSidebar('user', ['field.manage']);
    fireEvent.click(adminToggle());
    const links = within(adminPanel()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/admin/fields']);
  });
});
