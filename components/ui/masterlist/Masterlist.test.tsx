// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
// IntersectionObserver không có trong jsdom.
class IO { observe() {} disconnect() {} }
vi.stubGlobal('IntersectionObserver', IO);

import { Masterlist, type Column } from './Masterlist';

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
