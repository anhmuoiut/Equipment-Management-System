// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: router.replace, push: router.push }),
  usePathname: () => '/golden',
  useSearchParams: () => new URLSearchParams(router.search),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
const rows = vi.hoisted(() => [
  { id: 'a', serial: 'SN-3' }, { id: 'b', serial: 'SN-1' }, { id: 'c', serial: 'SN-2' },
]);
vi.mock('@/lib/client/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/api')>()),
  api: { get: vi.fn(async () => ({ data: rows, meta: {} })) },
}));
class IO { observe() {} disconnect() {} }
vi.stubGlobal('IntersectionObserver', IO);

import { ModuleWorkspace, useList } from './ModuleWorkspace';

type Row = { id: string; serial: string };

function Harness({ canAdd = true }: { canAdd?: boolean }) {
  const list = useList<Row>('/api/test');
  return (
    <ModuleWorkspace<Row>
      title="Golden" list={list} storageKey={`ws-${Math.random()}`} exportName="t" canAdd={canAdd}
      columns={[{ key: 'serial', label: 'Serial', value: (r) => r.serial }]}
      tools={[{
        key: 'import', label: 'Import',
        render: ({ onClose }) => <div data-testid="tool">tool<button type="button" onClick={onClose}>close tool</button></div>,
      }]}
      renderDetail={(ctx) => (
        <div data-testid="panel">
          <span data-testid="current">{ctx.creating ? 'NEW' : ctx.row?.serial}</span>
          <button type="button" onClick={ctx.nav.onPrev} disabled={!ctx.nav.onPrev}>prev</button>
          <button type="button" onClick={ctx.nav.onNext} disabled={!ctx.nav.onNext}>next</button>
          <button type="button" onClick={ctx.onClose}>close</button>
        </div>
      )}
    />
  );
}

async function mount(canAdd = true) {
  await act(async () => { render(<Harness canAdd={canAdd} />); });
}
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

beforeEach(() => { router.replace.mockClear(); router.search = ''; });

describe('ModuleWorkspace — Masterlist + Detail Panel', () => {
  it('opens the clicked row and writes ?id= to the URL', async () => {
    await mount();
    expect(screen.queryByTestId('panel')).toBeNull();
    fireEvent.click(bodyRows()[1]!);
    expect(screen.getByTestId('current').textContent).toBe('SN-1');
    expect(router.replace).toHaveBeenLastCalledWith('/golden?id=b', { scroll: false });
  });

  it('‹ › follow the current sort order of the list', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Serial/ }));   // sort: SN-1, SN-2, SN-3
    fireEvent.click(bodyRows()[0]!);
    expect(screen.getByTestId('current').textContent).toBe('SN-1');
    expect((screen.getByRole('button', { name: 'prev' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('current').textContent).toBe('SN-2');
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('current').textContent).toBe('SN-3');
    expect((screen.getByRole('button', { name: 'next' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('↓ / J move to the next record when not typing', async () => {
    await mount();
    fireEvent.click(bodyRows()[0]!);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByTestId('current').textContent).toBe('SN-1');
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByTestId('current').textContent).toBe('SN-2');
  });

  it('reopens the record from ?id= and closes back to the list', async () => {
    router.search = 'id=c';
    await mount();
    expect(screen.getByTestId('current').textContent).toBe('SN-2');
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByTestId('panel')).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith('/golden', { scroll: false });
  });

  it('+ Add opens the same panel in create mode (?new=1)', async () => {
    await mount();
    fireEvent.click(within(document.querySelector('.ml') as HTMLElement).getByRole('button', { name: /ml.add/ }));
    expect(screen.getByTestId('current').textContent).toBe('NEW');
    expect(router.replace).toHaveBeenLastCalledWith('/golden?new=1', { scroll: false });
  });

  it('the floating add shortcut opens create mode and returns when the panel closes', async () => {
    await mount();
    const fab = document.querySelector('.ws-add-fab') as HTMLButtonElement;
    expect(fab.getAttribute('aria-label')).toBe('ml.add');
    fireEvent.click(fab);
    expect(screen.getByTestId('current').textContent).toBe('NEW');
    expect(router.replace).toHaveBeenLastCalledWith('/golden?new=1', { scroll: false });
    expect(document.querySelector('.ws-add-fab')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(document.querySelector('.ws-add-fab')).toBeTruthy();
  });

  it('does not expose the floating add shortcut to viewers without add permission', async () => {
    await mount(false);
    expect(document.querySelector('.ws-add-fab')).toBeNull();
    expect(screen.queryByRole('button', { name: /ml.add/ })).toBeNull();
  });

  it('a tool (Import) opens in the same panel (?tool=) and gives way to a clicked row', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByTestId('tool')).toBeTruthy();
    expect(screen.queryByTestId('panel')).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith('/golden?tool=import', { scroll: false });
    fireEvent.click(bodyRows()[0]!);
    expect(screen.queryByTestId('tool')).toBeNull();
    expect(screen.getByTestId('current').textContent).toBe('SN-3');
  });

  it('reopens a tool from ?tool= and closes back to the list', async () => {
    router.search = 'tool=import';
    await mount();
    expect(screen.getByTestId('tool')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'close tool' }));
    expect(screen.queryByTestId('tool')).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith('/golden', { scroll: false });
  });
});
