import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => { throw new Error('no database in unit tests'); } }));

import { dueState } from './calibration';

describe('dueState — tô màu cột Due date (docs/DATABASE_MODIFIED.md mục 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-01 10:00 giờ Việt Nam
    vi.setSystemTime(new Date('2026-10-01T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is no_interval when the part number has no interval', () => {
    expect(dueState('2026-12-01', null, false)).toBe('no_interval');
  });
  it('is none when never calibrated', () => {
    expect(dueState(null, 30, true)).toBe('none');
  });
  it('is overdue the day after the due date', () => {
    expect(dueState('2026-09-30', 30, true)).toBe('overdue');
  });
  it('is due_soon on the due date and within warning_days', () => {
    expect(dueState('2026-10-01', 30, true)).toBe('due_soon');
    expect(dueState('2026-10-31', 30, true)).toBe('due_soon');
  });
  it('is ok beyond warning_days', () => {
    expect(dueState('2026-11-01', 30, true)).toBe('ok');
    expect(dueState('2026-10-20', 7, true)).toBe('ok');
  });
  it('uses the Vietnam calendar day, not UTC', () => {
    // 2026-10-01 23:30 UTC = 2026-10-02 06:30 giờ Việt Nam → hạn 2026-10-01 đã quá.
    vi.setSystemTime(new Date('2026-10-01T23:30:00Z'));
    expect(dueState('2026-10-01', 30, true)).toBe('overdue');
  });
});
