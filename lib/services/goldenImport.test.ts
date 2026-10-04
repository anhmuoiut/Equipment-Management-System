import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => { throw new Error('no database in unit tests'); } }));

import ExcelJS from 'exceljs';
import { buildGoldenTemplate, checkGoldenTable } from './goldenImport';
import { headerKeys, readWorkbook } from './equipmentImport';
import { GOLDEN_IMPORT_COLUMNS } from '@/lib/goldenImport';
import type { Lookups } from './core/lookups';
import type { StatusOption } from '@/lib/types';
import { AppError } from '@/lib/errors';

type Named = { id: string; display_name: string; sort_order: number; is_active: boolean };
const named = (prefix: string, names: [string, boolean?][]): Map<string, Named> =>
  new Map(names.map(([name, active = true], i) => [`${prefix}-${i}`, { id: `${prefix}-${i}`, display_name: name, sort_order: i, is_active: active }]));
const status = (id: string, name: string, remark = false): [string, StatusOption] =>
  [id, { id, display_name: name, sort_order: 0, requires_remark: remark, color: 'gray' }];

const lookups: Lookups = {
  part_numbers: new Map(),
  types: new Map(),
  levels: new Map(),
  locations: named('loc', [['B3F1'], ['B3F2'], ['Closed', false]]),
  departments: new Map(),
  calibration_vendors: new Map(),
  statuses: new Map([status('st-active', 'Active'), status('st-repair', 'Repair', true)]),
  users: new Map(),
};

/** Điền file mẫu như người dùng: nhập từ dòng 3 của sheet Golden. */
async function filledTemplate(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildGoldenTemplate(lookups, 'vi', new Date('2026-10-04T03:00:00Z'))) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Golden')!;
  rows.forEach((values, i) => values.forEach((v, c) => { if (v !== null) ws.getCell(3 + i, c + 1).value = v; }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS = headerKeys(GOLDEN_IMPORT_COLUMNS);
const check = async (rows: (string | null)[][], existing: string[] = []) =>
  checkGoldenTable(await readWorkbook(await filledTemplate(rows), HEADERS), lookups, existing);

/** Một dòng file mẫu: Part, Serial, UTD, Location, Status, Origin, Purpose, Remark. */
type Cells = { pn?: string | null; sn?: string | null; utd?: string; loc?: string | null; status?: string | null; origin?: string; purpose?: string; remark?: string };
const line = (c: Cells): (string | null)[] => [
  c.pn === undefined ? 'P1' : c.pn, c.sn === undefined ? 'G-1' : c.sn, c.utd ?? null,
  c.loc === undefined ? 'B3F1' : c.loc, c.status === undefined ? 'Active' : c.status,
  c.origin ?? null, c.purpose ?? null, c.remark ?? null,
];

describe('golden import template', () => {
  it('has the Golden / Guide / Valid values sheets with the column headers on row 2', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildGoldenTemplate(lookups, 'en')) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Golden', 'Guide', 'Valid values']);
    const header = wb.getWorksheet('Golden')!.getRow(2);
    const titles = GOLDEN_IMPORT_COLUMNS.map((_c, i) => String((header.getCell(i + 1).value as { richText?: { text: string }[] })?.richText?.[0]?.text ?? header.getCell(i + 1).value));
    expect(titles).toEqual(GOLDEN_IMPORT_COLUMNS.map((c) => c.header));
  });

  it('lists only usable locations and all statuses in Valid values', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildGoldenTemplate(lookups, 'en')) as unknown as ArrayBuffer);
    const vs = wb.getWorksheet('Valid values')!;
    expect([2, 3, 4].map((r) => vs.getCell(r, 1).value)).toEqual(['B3F1', 'B3F2', null]);
    expect([2, 3].map((r) => vs.getCell(r, 2).value)).toEqual(['Active', 'Repair']);
  });
});

describe('checkGoldenTable', () => {
  it('maps a valid row to ids and trims text', async () => {
    const { report, inserts } = await check([line({ pn: ' P1 ', loc: 'b3f2', status: 'ACTIVE', origin: 'Lab', purpose: 'Calibrate', utd: 'U-9' })]);
    expect(report).toMatchObject({ total: 1, valid: 1, invalid: 0, duplicates: 0, rows: [] });
    expect(inserts).toEqual([{
      part_number: 'P1', serial_number: 'G-1', utd_part_number: 'U-9', location_id: 'loc-1', status_id: 'st-active',
      origin: 'Lab', purpose: 'Calibrate', remark: null,
    }]);
  });

  it('reports required cells by column and row', async () => {
    const { report, inserts } = await check([line({ pn: null, sn: null, loc: null, status: null, origin: 'Lab' })]);
    expect(report.invalid).toBe(1);
    expect(report.rows[0]!.row).toBe(3);
    expect(report.rows[0]!.issues.map((i) => [i.column, i.code])).toEqual([
      ['part_number', 'required'], ['serial_number', 'required'], ['location_id', 'required'], ['status_id', 'required'],
    ]);
    expect(inserts).toEqual([]);
  });

  it('rejects unknown, hidden and too-long values', async () => {
    const { report } = await check([
      line({ loc: 'Nowhere' }),
      line({ loc: 'Closed' }),
      line({ status: 'Gone' }),
      line({ origin: 'x'.repeat(201) }),
      line({ purpose: 'x'.repeat(501) }),
    ]);
    expect(report.rows.map((r) => r.issues[0])).toEqual([
      { column: 'location_id', code: 'not_found', value: 'Nowhere' },
      { column: 'location_id', code: 'inactive', value: 'Closed' },
      { column: 'status_id', code: 'not_found', value: 'Gone' },
      { column: 'origin', code: 'too_long', max: 200 },
      { column: 'purpose', code: 'too_long', max: 500 },
    ]);
  });

  it('requires a remark for statuses that need one', async () => {
    const { report, inserts } = await check([line({ status: 'Repair' }), line({ sn: 'G-2', status: 'Repair', remark: 'broken' })]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.issues).toEqual([{ column: 'remark', code: 'remark_required', value: 'Repair' }]);
    expect(inserts.map((r) => r.serial_number)).toEqual(['G-2']);
  });

  it('warns on duplicate serials (system and file) but still accepts them', async () => {
    const { report, inserts } = await check(
      [line({ sn: 'g-1' }), line({ sn: 'G-5' }), line({ sn: ' G-5 ' })], ['G-1'],
    );
    expect(report).toMatchObject({ total: 3, valid: 3, invalid: 0, duplicates: 2 });
    expect(report.rows.map((r) => [r.row, r.duplicate_of])).toEqual([[3, 'existing'], [5, 4]]);
    expect(inserts).toHaveLength(3);
  });

  it('skips blank rows and counts only filled ones', async () => {
    const { report } = await check([line({}), [null, null, null, null, null, null, null, null], line({ sn: 'G-2' })]);
    expect(report.total).toBe(2);
  });

  it('rejects a file with no data rows', async () => {
    await expect(check([])).rejects.toMatchObject({ details: { fields: { file: 'empty' } } });
  });

  it('rejects a file missing required columns', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Golden');
    ws.addRow(['Serial number', 'Remark']);
    ws.addRow(['G-1', 'x']);
    const table = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), HEADERS);
    try {
      checkGoldenTable(table, lookups, []);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).details).toMatchObject({ fields: { file: 'missing_columns' }, columns: ['Part number', 'Location', 'Status'] });
    }
  });

  it('accepts header variants and ignores unknown columns', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['PART NUMBER', 'serial_number *', 'location', 'Status', 'Colour']);
    ws.addRow(['P1', 'G-1', 'B3F1', 'Active', 'red']);
    const { report, inserts } = checkGoldenTable(await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), HEADERS), lookups, []);
    expect(report).toMatchObject({ valid: 1, ignored_columns: ['Colour'] });
    expect(inserts[0]).toMatchObject({ part_number: 'P1', location_id: 'loc-0', status_id: 'st-active' });
  });
});
