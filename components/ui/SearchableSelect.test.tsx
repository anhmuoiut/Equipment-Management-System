// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from './SearchableSelect';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

describe('SearchableSelect', () => {
  it('opens the popover on click and lists every option', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick one" />);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Pick one' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Alpha')).toBeTruthy();
    expect(within(listbox).getByText('Bravo')).toBeTruthy();
    expect(within(listbox).getByText('Charlie')).toBeTruthy();
  });

  it('filters options as the user types in the search box', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick one" />);
    await user.click(screen.getByRole('button', { name: 'Pick one' }));

    const search = screen.getByRole('textbox');
    await user.type(search, 'bra');

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Bravo')).toBeTruthy();
    expect(within(listbox).queryByText('Alpha')).toBeNull();
    expect(within(listbox).queryByText('Charlie')).toBeNull();
  });

  it('calls onChange and closes the popover when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="" onChange={onChange} options={OPTIONS} placeholder="Pick one" />);
    await user.click(screen.getByRole('button', { name: 'Pick one' }));

    await user.click(screen.getByText('Bravo'));

    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the selected option label on the trigger instead of the placeholder', () => {
    render(<SearchableSelect value="b" onChange={() => {}} options={OPTIONS} placeholder="Pick one" />);
    expect(screen.getByRole('button', { name: 'Bravo' })).toBeTruthy();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick one" disabled />);
    await user.click(screen.getByRole('button', { name: 'Pick one' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('SearchableSelect on a phone (bottom sheet)', () => {
  afterEach(() => vi.mocked(window.matchMedia).mockReset());
  function phone() {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  }

  it('opens a titled sheet instead of a popover; short lists have no search box and do not steal focus', async () => {
    phone();
    const user = userEvent.setup();
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick one" ariaLabel="Letter" />);
    await user.click(screen.getByRole('button', { name: 'Letter' }));
    const dialog = screen.getByRole('dialog', { name: 'Letter' });
    expect(dialog.classList.contains('modal-dialog--sheet')).toBe(true);
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(within(dialog).queryByRole('searchbox')).toBeNull();
  });

  it('picking an option commits it and closes the sheet', async () => {
    phone();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect value="" onChange={onChange} options={OPTIONS} placeholder="Pick one" ariaLabel="Letter" />);
    await user.click(screen.getByRole('button', { name: 'Letter' }));
    await user.click(screen.getByRole('option', { name: 'Bravo' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('long lists get a search box that filters the options', async () => {
    phone();
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    render(<SearchableSelect value="" onChange={() => {}} options={many} placeholder="Pick one" ariaLabel="Item" />);
    await user.click(screen.getByRole('button', { name: 'Item' }));
    await user.type(screen.getByRole('searchbox'), 'Item 1');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Item 1', 'Item 10', 'Item 11']);
  });

  it('a sheet opened over an open dialog closes alone on Escape', async () => {
    phone();
    const user = userEvent.setup();
    const closeOuter = vi.fn();
    const { Modal } = await import('@/components/ui');
    render(<Modal title="Account" onClose={closeOuter}><SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick" ariaLabel="Letter" /></Modal>);
    await user.click(screen.getByRole('button', { name: 'Letter' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Letter' })).toBeNull();
    expect(closeOuter).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeTruthy();
  });
});
