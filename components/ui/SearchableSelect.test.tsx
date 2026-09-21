// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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
