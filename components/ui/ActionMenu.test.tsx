// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { ActionMenu } from './ActionMenu';

describe('ActionMenu', () => {
  const items = [
    { key: 'delete', label: 'Delete', danger: true, onClick: vi.fn() },
    { key: 'move', label: 'Move', onClick: vi.fn() },
  ];

  it('opens a menu with destructive items last, runs the chosen item and closes', () => {
    render(<ActionMenu items={items} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /dp.actionsMenu/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Move', 'Delete']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));
    expect(items[1]!.onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('can be an icon-only ⋮ button with its own accessible name', () => {
    render(<ActionMenu items={items} iconOnly ariaLabel="More actions" />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('Escape closes it', () => {
    render(<ActionMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /dp.actionsMenu/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('is disabled while an item is running', () => {
    render(<ActionMenu items={items} busy />);
    expect(screen.getByRole('button', { name: /dp.actionsMenu/ })).toHaveProperty('disabled', true);
  });
});
