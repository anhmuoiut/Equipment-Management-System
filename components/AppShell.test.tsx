// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/ui', () => ({ ToastViewport: () => null }));
vi.mock('@/components/ViewerContext', () => ({ ViewerProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/AppSidebar', () => ({ AppSidebar: ({ onToggleCollapse }: { onToggleCollapse: () => void }) => <button onClick={onToggleCollapse}>Pin</button> }));
import { AppShell } from './AppShell';
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function setup() {
  const view = render(<AppShell userId="1" username="user" fullName="User" role="user">Content</AppShell>);
  return { ...view, shell: view.container.querySelector('.app-shell')!, panel: view.container.querySelector('.sidebar-region')! };
}
it('starts collapsed, opens on hover and closes after a short delay', () => {
  const { shell, panel } = setup();
  expect(shell.getAttribute('data-sidebar-open')).toBe('false');
  fireEvent.pointerEnter(panel);
  expect(shell.getAttribute('data-sidebar-open')).toBe('true');
  fireEvent.pointerLeave(panel);
  act(() => vi.advanceTimersByTime(200));
  expect(shell.getAttribute('data-sidebar-open')).toBe('true');
  act(() => vi.advanceTimersByTime(50));
  expect(shell.getAttribute('data-sidebar-open')).toBe('false');
});
it('cancels closing when the pointer returns and remembers pinning', () => {
  const { shell, panel, getByText, unmount } = setup();
  fireEvent.pointerEnter(panel);
  fireEvent.pointerLeave(panel);
  act(() => vi.advanceTimersByTime(100));
  fireEvent.pointerEnter(panel);
  act(() => vi.advanceTimersByTime(300));
  expect(shell.getAttribute('data-sidebar-open')).toBe('true');
  fireEvent.click(getByText('Pin'));
  fireEvent.pointerLeave(panel);
  act(() => vi.advanceTimersByTime(300));
  expect(shell.getAttribute('data-sidebar-open')).toBe('true');
  expect(localStorage.getItem('equipment-sidebar-pinned')).toBe('true');
  unmount();
  expect(setup().shell.getAttribute('data-sidebar-open')).toBe('true');
});
