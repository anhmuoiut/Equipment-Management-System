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
vi.mock('@/lib/client/api', () => ({
  api: { get: vi.fn(async () => ({ data: rows, meta: {} })) },
  ApiError: class extends Error {},
}));
class IO { observe() {} disconnect() {} }
vi.stubGlobal('IntersectionObserver', IO);

import { ModuleWorkspace, useList } from './ModuleWorkspace';

type Row = { id: string; serial: string };

function Harness() {
  const list = useList<Row>('/api/test');
  return (
    <ModuleWorkspace<Row>
      title="Golden" list={list} storageKey={`ws-${Math.random()}`} exportName="t" canAdd
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

async function mount() {
  await act(async () => { render(<Harness />); });
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
    fireEvent.click(screen.getByRole('button', { name: /ml.add/ }));
    expect(screen.getByTestId('current').textContent).toBe('NEW');
    expect(router.replace).toHaveBeenLastCalledWith('/golden?new=1', { scroll: false });
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
