// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
// IntersectionObserver không có trong jsdom.
class IO { observe() {} disconnect() {} }
vi.stubGlobal('IntersectionObserver', IO);

import { Masterlist, RowCard, type Column } from './Masterlist';

type Row = { id: string; serial: string; type: string | null; qty: number };
const rows: Row[] = [
  { id: 'a', serial: 'SN-10', type: 'Tester', qty: 3 },
  { id: 'b', serial: 'SN-2', type: 'Base', qty: 1 },
  { id: 'c', serial: 'SN-1', type: 'Tester', qty: 2 },
  { id: 'd', serial: 'XYZ', type: null, qty: 5 },
];
const columns: Column<Row>[] = [
  { key: 'serial', label: 'Serial', value: (r) => r.serial },
  { key: 'type', label: 'Type', value: (r) => r.type, filter: true },
  { key: 'qty', label: 'Qty', value: (r) => r.qty },
];

function setup(onViewChange = vi.fn(), onSelect = vi.fn()) {
  render(
    <Masterlist<Row> title="Test" rows={rows} loading={false} error={null} columns={columns} storageKey={`t-${Math.random()}`}
      selectedId={null} onSelect={onSelect} exportName="test" onViewChange={onViewChange} />,
  );
  return { onViewChange, onSelect };
}
const lastView = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('Masterlist — docs/DETAIL_MODEL.md mục 2', () => {
  it('shows every row with a running No column', () => {
    const { onViewChange } = setup();
    expect(bodyRows()).toHaveLength(4);
    expect(bodyRows().map((r) => r.querySelector('.ml-col-no')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(lastView(onViewChange)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('searches across columns (case-insensitive) and reports the visible order', () => {
    const { onViewChange } = setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tester' } });
    expect(lastView(onViewChange)).toEqual(['a', 'c']);
  });

  it('sorts naturally (SN-2 before SN-10), then descending, then back to original', () => {
    const { onViewChange } = setup();
    const header = screen.getByRole('button', { name: /Serial/ });
    fireEvent.click(header);
    expect(lastView(onViewChange)).toEqual(['c', 'b', 'a', 'd']);
    fireEvent.click(header);
    expect(lastView(onViewChange)).toEqual(['d', 'a', 'b', 'c']);
    fireEvent.click(header);
    expect(lastView(onViewChange)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by a column value, including empty', () => {
    const { onViewChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /ml.filters/ }));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Base' } });
    expect(lastView(onViewChange)).toEqual(['b']);
    fireEvent.change(select, { target: { value: '' } });
    expect(lastView(onViewChange)).toEqual(['d']);
  });

  it('opens a row by click and by keyboard', () => {
    const { onSelect } = setup();
    fireEvent.click(bodyRows()[1]!);
    expect(onSelect).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(bodyRows()[2]!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });

  it('hides a column from Column settings and keeps the others', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /ml.columns/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Type' }));
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['ml.no', 'Serial', 'Qty']);
  });
});

/** Phone layout: matchMedia('(max-width: 800px)') reports a match. */
function phoneMode(on: boolean) {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: on, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
}

describe('Phone layout — a card per row instead of a squeezed table', () => {
  afterEach(() => phoneMode(false));
  const cards = () => screen.queryAllByRole('button').filter((b) => b.classList.contains('ml-card'));
  function setupPhone(extra: Partial<Parameters<typeof Masterlist<Row>>[0]> = {}) {
    phoneMode(true);
    const onSelect = vi.fn();
    const onViewChange = vi.fn();
    render(
      <Masterlist<Row> title="Phone" rows={rows} loading={false} error={null} columns={columns} storageKey={`p-${Math.random()}`}
        selectedId={null} onSelect={onSelect} exportName="test" onViewChange={onViewChange}
        mobileCard={(r) => <RowCard title={r.serial} tag={r.type} lines={[`qty ${r.qty}`]} />} {...extra} />,
    );
    return { onSelect, onViewChange };
  }

  it('renders one tappable card per row — no table, no column picker, no sort headers', () => {
    const { onSelect } = setupPhone();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /ml.columns/ })).toBeNull();
    expect(cards().map((c) => c.querySelector('.rc-title')?.textContent)).toEqual(['SN-10', 'SN-2', 'SN-1', 'XYZ']);
    fireEvent.click(cards()[1]!);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('builds a card from the columns when the module gives none', () => {
    setupPhone({ mobileCard: undefined });
    const first = cards()[0]!;
    expect(first.querySelector('.rc-title')?.textContent).toBe('SN-10');
    expect(first.textContent).toContain('Tester');
    expect(first.textContent).toContain('3');
  });

  it('search narrows the cards and reports the visible order', () => {
    const { onViewChange } = setupPhone();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tester' } });
    expect(cards()).toHaveLength(2);
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'c']);
  });

  it('Filter & sort opens as a sheet: filter by a column, sort, see the result count, clear', () => {
    const { onViewChange } = setupPhone();
    fireEvent.click(screen.getByRole('button', { name: 'ml.filtersAndSort' }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.change(sheet.getByRole('combobox', { name: /Type/ }), { target: { value: 'Tester' } });
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'c']);
    fireEvent.change(sheet.getByRole('combobox', { name: 'ml.sortBy' }), { target: { value: 'serial' } });
    expect(onViewChange).toHaveBeenLastCalledWith(['c', 'a']);
    fireEvent.click(sheet.getByRole('button', { name: /ml.sortDesc/ }));
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'c']);
    expect(sheet.getByRole('button', { name: /ml.showResults/ })).toBeTruthy();
    fireEvent.click(sheet.getByRole('button', { name: 'ml.clearFilters' }));
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd']);
    fireEvent.click(sheet.getByRole('button', { name: /ml.showResults/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('active filter and sort show as removable chips when the sheet is closed', () => {
    const { onViewChange } = setupPhone();
    fireEvent.click(screen.getByRole('button', { name: 'ml.filtersAndSort' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Type/ }), { target: { value: 'Base' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /ml.showResults/ }));
    fireEvent.click(screen.getByRole('button', { name: /Type: Base/ }));
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd']);
  });

  it('puts Export and module tools in one ⋮ menu; Add is the floating + of the workspace, not a toolbar button', () => {
    const open = vi.fn();
    setupPhone({ onAdd: vi.fn(), tools: [{ key: 'import', label: 'Import Excel', onClick: open }] });
    expect(screen.queryByRole('button', { name: /ml.add/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ml.moreActions' }));
    expect(screen.getByRole('menuitem', { name: /ml.export/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import Excel' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('shows quick filters as chips under the toolbar', () => {
    const { onViewChange } = setupPhone({ quickFilters: [{ key: 'many', label: 'Many', test: (r) => r.qty >= 3 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Many' }));
    expect(onViewChange).toHaveBeenLastCalledWith(['a', 'd']);
  });
});
