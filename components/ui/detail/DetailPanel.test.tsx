// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { DetailPanel } from './DetailPanel';

const header = () => document.querySelector('.dp-header') as HTMLElement;

describe('DetailPanel header', () => {
  it('shows ‹ › while at least one of them can go somewhere', () => {
    render(<DetailPanel layout="panel" title="SN-1" nav={{ onNext: () => {} }} onClose={() => {}}>x</DetailPanel>);
    expect(screen.getByRole('button', { name: 'dp.prev' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'dp.next' }).hasAttribute('disabled')).toBe(false);
    expect(header().hasAttribute('data-nav')).toBe(true);
  });

  it('shows no dead ‹ › when both would be disabled (one record, or the full page of a record)', () => {
    render(<DetailPanel layout="page" title="SN-1" subtitle="P1 · Base" nav={{}} onClose={() => {}}>x</DetailPanel>);
    expect(screen.queryByRole('button', { name: 'dp.prev' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'dp.next' })).toBeNull();
    expect(header().hasAttribute('data-nav')).toBe(false);
  });

  it('has no decorative module icon tile', () => {
    render(<DetailPanel layout="panel" title="SN-1" onClose={() => {}}>x</DetailPanel>);
    expect(document.querySelector('.dp-module-icon')).toBeNull();
  });
});
