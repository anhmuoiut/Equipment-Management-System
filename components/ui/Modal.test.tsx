// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { Modal } from './index';

describe('Modal', () => {
  it('sheet variant adds the phone bottom-sheet classes', () => {
    render(<Modal sheet title="Filters" onClose={() => {}}>body</Modal>);
    expect(document.querySelector('.modal-overlay--sheet')).toBeTruthy();
    expect(screen.getByRole('dialog').classList.contains('modal-dialog--sheet')).toBe(true);
  });

  it('Escape closes only the newest dialog (a picker sheet over another dialog)', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<><Modal title="Outer" onClose={outer}>a</Modal><Modal sheet title="Inner" onClose={inner}>b</Modal></>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('once the newest dialog is gone, Escape reaches the one underneath', () => {
    const outer = vi.fn();
    const { rerender } = render(<><Modal title="Outer" onClose={outer}>a</Modal><Modal title="Inner" onClose={() => {}}>b</Modal></>);
    rerender(<Modal title="Outer" onClose={outer}>a</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
