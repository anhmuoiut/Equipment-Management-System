import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const tables = vi.hoisted(() => ({
  status: [] as unknown[],
  equipment: [] as unknown[],
  /** Rows PostgREST hands back per request, whatever range was asked for. */
  rowCap: 1000,
  ranges: [] as { table: string; from: number; to: number }[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'app_settings') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { due_soon_days: 14 } } }) }) }) };
      }
      const rows = table === 'equipment_calibration_status' ? tables.status
        : table === 'equipment' ? tables.equipment : null;
      if (!rows) throw new Error('Unexpected table ' + table);
      const builder = {
        select: () => builder, is: () => builder, eq: () => builder, order: () => builder,
        range: async (from: number, to: number) => {
          tables.ranges.push({ table, from, to });
          return { data: rows.slice(from, Math.min(to + 1, from + tables.rowCap)), error: null, count: rows.length };
        },
      };
      return builder;
    },
  }),
}));

import { buildCalibrationOverview, listCalibrationOverview, type CalibrationOverviewRow } from './calibration';

function row(overrides: Partial<CalibrationOverviewRow> & Pick<CalibrationOverviewRow, 'serial_number' | 'calibration_status'>): CalibrationOverviewRow {
  return {
    equipment_id: `eq-${overrides.serial_number}`, part_number: null, jabil_id: null, asset: null,
    type_label: null, location_label: null, last_calibration_date: null, calibration_due_date: null,
    last_calibrated_by: null, days_until_due: null,
    ...overrides,
  };
}

const ROWS: CalibrationOverviewRow[] = [
  row({ serial_number: 'SN-10', calibration_status: 'VALID', calibration_due_date: '2027-03-01', location_label: 'B2' }),
  row({ serial_number: 'SN-2', calibration_status: 'DUE_SOON', calibration_due_date: '2026-10-09', last_calibrated_by: 'Metrology Lab' }),
  row({ serial_number: 'SN-9', calibration_status: 'NOT_CALIBRATED' }),
  row({ serial_number: 'SN-3', calibration_status: 'OVERDUE', calibration_due_date: '2026-09-01' }),
  row({ serial_number: 'SN-1', calibration_status: 'OVERDUE', calibration_due_date: '2026-08-15', location_label: 'B2' }),
  row({ serial_number: 'SN-4', calibration_status: 'NOT_CALIBRATED' }),
];

describe('buildCalibrationOverview', () => {
  it('lists the most urgent first: overdue (most overdue first), not calibrated, due soon, valid', () => {
    const { rows, total } = buildCalibrationOverview(ROWS, { page: 1, pageSize: 50 });
    expect(rows.map((r) => r.serial_number)).toEqual(['SN-1', 'SN-3', 'SN-4', 'SN-9', 'SN-2', 'SN-10']);
    expect(total).toBe(6);
  });

  it('counts every status for the filter buttons, independent of the selected status', () => {
    const { rows, total, counts } = buildCalibrationOverview(ROWS, { status: 'OVERDUE', page: 1, pageSize: 50 });
    expect(rows.map((r) => r.serial_number)).toEqual(['SN-1', 'SN-3']);
    expect(total).toBe(2);
    expect(counts).toEqual({ ALL: 6, OVERDUE: 2, NOT_CALIBRATED: 2, DUE_SOON: 1, VALID: 1 });
  });

  it('narrows counts and rows by search across identity, location and calibrated-by', () => {
    const byLocation = buildCalibrationOverview(ROWS, { search: ' b2 ', page: 1, pageSize: 50 });
    expect(byLocation.rows.map((r) => r.serial_number)).toEqual(['SN-1', 'SN-10']);
    expect(byLocation.counts).toEqual({ ALL: 2, OVERDUE: 1, NOT_CALIBRATED: 0, DUE_SOON: 0, VALID: 1 });

    const byLab = buildCalibrationOverview(ROWS, { search: 'metrology', page: 1, pageSize: 50 });
    expect(byLab.rows.map((r) => r.serial_number)).toEqual(['SN-2']);
  });

  it('pages after sorting and never reorders its input', () => {
    const input = [...ROWS];
    const second = buildCalibrationOverview(input, { page: 2, pageSize: 4 });
    expect(second.rows.map((r) => r.serial_number)).toEqual(['SN-2', 'SN-10']);
    expect(second.total).toBe(6);
    expect(input).toEqual(ROWS);
  });
});

describe('listCalibrationOverview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
    tables.ranges = [];
    tables.rowCap = 1000;
    tables.status = [
      { equipment_id: 'a', calibration_status: 'OVERDUE', last_calibration_date: '2025-09-25', calibration_due_date: '2026-09-25', last_calibrated_by: 'Lab A' },
      { equipment_id: 'b', calibration_status: 'DUE_SOON', last_calibration_date: '2025-10-10', calibration_due_date: '2026-10-10', last_calibrated_by: 'Lab B' },
      { equipment_id: 'c', calibration_status: 'NOT_CALIBRATED', last_calibration_date: null, calibration_due_date: null, last_calibrated_by: null },
      // Archived / no longer required between the two reads: no identity row.
      { equipment_id: 'gone', calibration_status: 'VALID', last_calibration_date: '2026-01-01', calibration_due_date: '2027-01-01', last_calibrated_by: null },
    ];
    tables.equipment = [
      { id: 'a', serial_number: 'SN-A', part_number: 'PN-1', jabil_id: 'P1', asset: null, type: [{ display_name: 'Tester' }], current_location: { code: 'L1' } },
      { id: 'b', serial_number: 'SN-B', part_number: null, jabil_id: null, asset: 'AS-2', type: null, current_location: [{ code: 'L2' }] },
      { id: 'c', serial_number: 'SN-C', part_number: null, jabil_id: null, asset: null, type: { display_name: 'Fixture' }, current_location: null },
    ];
  });
  afterEach(() => vi.useRealTimers());

  it('joins identity to the derived state and counts days from the UTC date', async () => {
    const result = await listCalibrationOverview({ page: 1, pageSize: 50 });
    expect(result.due_soon_days).toBe(14);
    expect(result.total).toBe(3);
    expect(result.rows).toEqual([
      expect.objectContaining({
        equipment_id: 'a', serial_number: 'SN-A', part_number: 'PN-1', type_label: 'Tester', location_label: 'L1',
        calibration_status: 'OVERDUE', calibration_due_date: '2026-09-25', last_calibrated_by: 'Lab A', days_until_due: -5,
      }),
      expect.objectContaining({ equipment_id: 'c', type_label: 'Fixture', location_label: null, days_until_due: null }),
      expect.objectContaining({ equipment_id: 'b', type_label: null, location_label: 'L2', days_until_due: 10 }),
    ]);
  });

  it('keeps reading when PostgREST caps a response below the requested range', async () => {
    tables.rowCap = 2;
    const result = await listCalibrationOverview({ page: 1, pageSize: 50 });
    expect(result.total).toBe(3);
    const statusReads = tables.ranges.filter((r) => r.table === 'equipment_calibration_status').map((r) => r.from);
    expect(statusReads).toEqual([0, 2]);
  });
});
