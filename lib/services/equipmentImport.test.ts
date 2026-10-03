import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => { throw new Error('no database in unit tests'); } }));

import ExcelJS from 'exceljs';
import { buildTemplate, cellText, checkTable, readWorkbook, type ExistingEquipment } from './equipmentImport';
import type { Lookups } from './core/lookups';
import type { StatusOption } from '@/lib/types';
import { AppError } from '@/lib/errors';

type Named = { id: string; display_name: string; sort_order: number; is_active: boolean };
const named = (prefix: string, names: [string, boolean?][]): Map<string, Named> =>
  new Map(names.map(([name, active = true], i) => [`${prefix}-${i}`, { id: `${prefix}-${i}`, display_name: name, sort_order: i, is_active: active }]));
const status = (id: string, name: string, pages: StatusOption['applies_to'], remark = false): [string, StatusOption] =>
  [id, { id, display_name: name, sort_order: 0, applies_to: pages, requires_remark: remark, color: 'gray' }];

const lookups: Lookups = {
  part_numbers: named('pn', [['P12316'], ['P20001'], ['OLD-PN', false]]),
  types: named('type', [['Tester'], ['Fixture']]),
  levels: named('level', [['1'], ['2'], ['3'], ['4'], ['5']]),
  locations: named('loc', [['B3F1'], ['B3F2'], ['Closed', false]]),
  departments: new Map(),
  calibration_vendors: new Map(),
  statuses: new Map([
    status('st-active', 'Active', ['equipment', 'golden_sample']),
    status('st-repair', 'Repair', ['equipment'], true),
    status('st-pass', 'Pass', ['calibration']),
  ]),
  users: new Map(),
};

async function loadTemplate(language: 'vi' | 'en' = 'vi') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate(lookups, language, new Date('2026-10-02T03:00:00Z'))) as unknown as ArrayBuffer);
  return wb;
}

/** Điền file mẫu như người dùng: nhập từ dòng 3 của sheet Equipment. */
async function filledTemplate(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = await loadTemplate();
  const ws = wb.getWorksheet('Equipment')!;
  rows.forEach((values, i) => values.forEach((v, c) => { if (v !== null) ws.getCell(3 + i, c + 1).value = v; }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** id cố định cho dòng mới: new-1, new-2… (theo thứ tự dòng). */
const ids = () => { let n = 0; return () => `new-${++n}`; };

const check = async (rows: (string | number | null)[][], existing: ExistingEquipment[] = []) =>
  checkTable(await readWorkbook(await filledTemplate(rows)), lookups, existing, ids());

const eq = (id: string, serial: string, part: string | null, location: string): ExistingEquipment =>
  ({ id, serial_number: serial, part_number_id: part, location_id: location });

/** Một dòng file mẫu; mặc định chỉ có Serial + Location. */
type Cells = {
  sn?: string | null; pn?: string; jabil?: string; asset?: string; type?: string; level?: string | number;
  status?: string; loc?: string | null; parent?: string; parentPn?: string; remark?: string;
};
const line = (c: Cells): (string | number | null)[] => [
  c.sn === undefined ? 'SN-X' : c.sn, c.pn ?? null, c.jabil ?? null, c.asset ?? null, c.type ?? null, c.level ?? null,
  c.status ?? null, c.loc === undefined ? 'B3F1' : c.loc, c.parent ?? null, c.parentPn ?? null, c.remark ?? null,
];

const GOOD = () => line({ sn: 'SN-001', pn: 'P12316', jabil: 'J1', asset: 'A-01', type: 'Tester', level: '3', status: 'Active' });

describe('equipment import template — ghi chú theo Configuration lúc tải', () => {
  it('has the entry sheet first, then guide and valid values', async () => {
    const wb = await loadTemplate('vi');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Equipment', 'Hướng dẫn', 'Giá trị hợp lệ']);
    expect((await loadTemplate('en')).worksheets.map((w) => w.name)).toEqual(['Equipment', 'Guide', 'Valid values']);
  });

  it('row 1 tells what each column accepts, row 2 is the header with * on required columns', async () => {
    const ws = (await loadTemplate()).getWorksheet('Equipment')!;
    const header = (c: number) => cellText(ws.getCell(2, c).value);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(header)).toEqual([
      'Serial number *', 'Part number', 'Jabil ID', 'Asset', 'Type', 'Level', 'Status', 'Location *',
      'Parent serial number', 'Parent part number', 'Remark',
    ]);
    expect(cellText(ws.getCell('F1').value)).toBe('Chọn: 1, 2, 3, 4, 5');
    expect(cellText(ws.getCell('A1').value)).toContain('Bắt buộc');
    expect(cellText(ws.getCell('A1').value)).toContain('200');
    // Status: chỉ trạng thái dùng cho Equipment; Repair cần Remark.
    expect(cellText(ws.getCell('G1').value)).toBe('Chọn: Active, Repair · Repair cần Remark');
    expect(cellText(ws.getCell('K1').value)).toContain('bắt buộc khi Status là Repair');
    // Giá trị đã ẩn không có trong danh sách chọn.
    expect(cellText(ws.getCell('B1').value)).toBe('Chọn: P12316, P20001');
    // Location: bắt buộc trừ khi có thiết bị cha; cột cha giải thích cách tìm.
    expect(cellText(ws.getCell('H1').value)).toBe('Bắt buộc khi không có Parent (có Parent thì để trống) · Chọn: B3F1, B3F2');
    expect(cellText(ws.getCell('I1').value)).toContain('một dòng khác trong file này');
    expect(cellText(ws.getCell('J1').value)).toContain('Chỉ cần khi serial cha trùng');
  });

  it('list columns get a drop-down from the valid values sheet, text columns a length limit', async () => {
    const wb = await loadTemplate();
    const ws = wb.getWorksheet('Equipment')!;
    const level = ws.getCell('F3').dataValidation;
    expect(level.type).toBe('list');
    expect(level.formulae).toEqual(["'Giá trị hợp lệ'!$C$2:$C$6"]);
    expect(level.prompt).toBe('Chọn: 1, 2, 3, 4, 5');
    expect(ws.getCell('F1002').dataValidation.type).toBe('list');
    expect(ws.getCell('A3').dataValidation).toMatchObject({ type: 'textLength', operator: 'lessThanOrEqual', formulae: [200] });
    expect(ws.getCell('K3').dataValidation.formulae).toEqual([1000]);
    // Part number của cha dùng chung danh sách Part number, chỉ cảnh báo (mã đã ẩn vẫn tìm được).
    expect(ws.getCell('J3').dataValidation).toMatchObject({
      type: 'list', formulae: ["'Giá trị hợp lệ'!$A$2:$A$3"], errorStyle: 'warning',
    });

    const values = wb.getWorksheet('Giá trị hợp lệ')!;
    const column = (c: number) => (values.getColumn(c).values as ExcelJS.CellValue[]).slice(1).map((v) => cellText(v));
    expect(column(1)).toEqual(['Part number', 'P12316', 'P20001']);
    expect(column(3)).toEqual(['Level', '1', '2', '3', '4', '5']);
    expect(column(4)).toEqual(['Status', 'Active', 'Repair']);
  });

  it('follows Configuration at download time — a new level shows up in the next template', async () => {
    const more = { ...lookups, levels: named('level', [['1'], ['2'], ['3'], ['4'], ['5'], ['6']]) };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTemplate(more, 'en')) as unknown as ArrayBuffer);
    expect(cellText(wb.getWorksheet('Equipment')!.getCell('F1').value)).toBe('Pick: 1, 2, 3, 4, 5, 6');
    expect(wb.getWorksheet('Equipment')!.getCell('F3').dataValidation.formulae).toEqual(["'Valid values'!$C$2:$C$7"]);
  });
});

describe('equipment import check — cùng quy tắc với form Thêm thiết bị', () => {
  it('maps every column of a valid row to ids, matching names case-insensitively', async () => {
    const { report, inserts } = await check([
      GOOD(), line({ sn: 'SN-002', pn: 'p20001', type: 'fixture', level: 5, status: 'active', loc: 'b3f2', remark: 'ok' }),
    ]);
    expect(report).toMatchObject({ total: 2, valid: 2, invalid: 0, duplicates: 0, rows: [], ignored_columns: [] });
    expect(inserts).toEqual([
      { id: 'new-1', serial_number: 'SN-001', part_number_id: 'pn-0', jabil_id: 'J1', asset: 'A-01', type_id: 'type-0', level_id: 'level-2', status_id: 'st-active', location_id: 'loc-0', parent_id: null, remark: null },
      { id: 'new-2', serial_number: 'SN-002', part_number_id: 'pn-1', jabil_id: null, asset: null, type_id: 'type-1', level_id: 'level-4', status_id: 'st-active', location_id: 'loc-1', parent_id: null, remark: 'ok' },
    ]);
  });

  it('reports each bad cell with its Excel row number', async () => {
    const { report, inserts } = await check([
      GOOD(),
      line({ sn: null, pn: 'P12316', level: '6', loc: null }),
      line({ sn: 'SN-003', pn: 'OLD-PN', status: 'Pass', loc: 'Closed' }),
      line({ sn: 'SN-004', status: 'Repair' }),
      line({ sn: 'x'.repeat(201) }),
    ]);
    expect(report).toMatchObject({ total: 5, valid: 1, invalid: 4 });
    expect(inserts).toHaveLength(1);
    expect(report.rows.map((r) => [r.row, r.issues])).toEqual([
      [4, [{ column: 'serial_number', code: 'required' }, { column: 'level_id', code: 'not_found', value: '6' }, { column: 'location_id', code: 'required' }]],
      [5, [{ column: 'part_number_id', code: 'inactive', value: 'OLD-PN' }, { column: 'status_id', code: 'status_not_allowed', value: 'Pass' }, { column: 'location_id', code: 'inactive', value: 'Closed' }]],
      [6, [{ column: 'remark', code: 'remark_required', value: 'Repair' }]],
      [7, [{ column: 'serial_number', code: 'too_long', max: 200 }]],
    ]);
  });

  it('warns (does not block) on duplicate serials in the system or earlier in the file', async () => {
    const { report, inserts } = await check([GOOD(), line({ sn: 'sn-001 ' }), line({ sn: 'SN-OLD' })], [eq('old-1', 'SN-old', null, 'loc-0')]);
    expect(report).toMatchObject({ total: 3, valid: 3, invalid: 0, duplicates: 2 });
    expect(inserts).toHaveLength(3);
    expect(report.rows.map((r) => [r.row, r.duplicate_of])).toEqual([[4, 3], [5, 'existing']]);
  });

  it('skips blank rows and accepts a file whose header is on row 1', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['SERIAL NUMBER', 'location', 'Note']);
    ws.addRow(['SN-1', 'B3F1', 'x']);
    ws.addRow([]);
    ws.addRow(['SN-2', 'B3F2', '']);
    const table = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    const { report, inserts } = checkTable(table, lookups, []);
    expect(report).toMatchObject({ total: 2, valid: 2, ignored_columns: ['Note'] });
    expect(inserts.map((r) => r.location_id)).toEqual(['loc-0', 'loc-1']);
  });

  it('rejects the whole file when a required column is missing or there are no rows', async () => {
    const fileCode = (e: unknown) => (e as AppError).details;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Data').addRow(['Serial number', 'Part number']).commit();
    wb.getWorksheet('Data')!.addRow(['SN-1', 'P12316']);
    const table = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(() => checkTable(table, lookups, [])).toThrow(AppError);
    try { checkTable(table, lookups, []); } catch (e) {
      expect(fileCode(e)).toEqual({ fields: { file: 'missing_columns' }, columns: ['Location'] });
    }
    const empty = await readWorkbook(await filledTemplate([]));
    try { checkTable(empty, lookups, []); throw new Error('expected empty'); } catch (e) {
      expect(fileCode(e)).toEqual({ fields: { file: 'empty' } });
    }
  });

  it('rejects a file that is not a readable workbook', async () => {
    await expect(readWorkbook(Buffer.from('not a zip'))).rejects.toMatchObject({ details: { fields: { file: 'unreadable' } } });
  });
});

describe('equipment import — thiết bị cha', () => {
  const RACK = eq('rack-1', 'RACK-01', 'pn-1', 'loc-1');

  it('attaches to existing equipment; location follows the parent', async () => {
    const { report, inserts } = await check([line({ sn: 'CH-1', loc: null, parent: 'rack-01' })], [RACK]);
    expect(report).toMatchObject({ valid: 1, invalid: 0 });
    expect(inserts[0]).toMatchObject({ id: 'new-1', parent_id: 'rack-1', location_id: 'loc-1' });
  });

  it('attaches to another row of the file, whatever the row order, down a whole chain', async () => {
    const { report, inserts } = await check([
      line({ sn: 'CARD-1', loc: null, parent: 'SLOT-1' }), // cháu — dòng đầu tiên
      line({ sn: 'SLOT-1', loc: null, parent: 'BOX-1' }),
      line({ sn: 'BOX-1', loc: 'B3F2' }),
    ]);
    expect(report).toMatchObject({ valid: 3, invalid: 0 });
    expect(inserts.map((r) => [r.id, r.parent_id, r.location_id])).toEqual([
      ['new-1', 'new-2', 'loc-1'], ['new-2', 'new-3', 'loc-1'], ['new-3', null, 'loc-1'],
    ]);
  });

  it("accepts a Location equal to the parent's, rejects a different one", async () => {
    const { report } = await check([
      line({ sn: 'CH-1', loc: 'B3F2', parent: 'RACK-01' }),
      line({ sn: 'CH-2', loc: 'B3F1', parent: 'RACK-01' }),
    ], [RACK]);
    expect(report.rows.map((r) => [r.row, r.issues])).toEqual([
      [4, [{ column: 'location_id', code: 'location_follows_parent', value: 'B3F2' }]],
    ]);
  });

  it('reports a parent that is missing, ambiguous, or part of a loop', async () => {
    const twins = [eq('t-1', 'TWIN', 'pn-0', 'loc-0'), eq('t-2', 'TWIN', 'pn-1', 'loc-1')];
    const { report } = await check([
      line({ sn: 'CH-1', loc: null, parent: 'NOPE' }),
      line({ sn: 'CH-2', loc: null, parent: 'TWIN' }),
      line({ sn: 'A', loc: null, parent: 'B' }),
      line({ sn: 'B', loc: null, parent: 'A' }),
      line({ sn: 'CH-3', parentPn: 'P12316' }),
    ], twins);
    expect(report.rows.map((r) => [r.row, r.issues])).toEqual([
      [3, [{ column: 'parent_serial', code: 'parent_not_found', value: 'NOPE' }]],
      [4, [{ column: 'parent_serial', code: 'parent_ambiguous', value: 'TWIN', count: 2 }]],
      [5, [{ column: 'parent_serial', code: 'parent_cycle', value: 'B' }]],
      [6, [{ column: 'parent_serial', code: 'parent_cycle', value: 'A' }]],
      [7, [{ column: 'parent_serial', code: 'required' }]],
    ]);
  });

  it('Parent part number picks one of several parents sharing a serial (hidden part numbers included)', async () => {
    const twins = [eq('t-1', 'TWIN', 'pn-0', 'loc-0'), eq('t-2', 'TWIN', 'pn-2', 'loc-1')];
    const { report, inserts } = await check([
      line({ sn: 'CH-1', loc: null, parent: 'twin', parentPn: 'old-pn' }),
      line({ sn: 'CH-2', loc: null, parent: 'TWIN', parentPn: 'P20001' }),
    ], twins);
    expect(inserts[0]).toMatchObject({ parent_id: 't-2', location_id: 'loc-1' });
    expect(report.rows.map((r) => [r.row, r.issues])).toEqual([
      [4, [{ column: 'parent_serial', code: 'parent_not_found', value: 'TWIN · P20001' }]],
    ]);
  });

  it('a file without a Location column is fine when every row has a parent', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Serial number', 'Parent serial number']);
    ws.addRow(['CH-1', 'RACK-01']);
    ws.addRow(['CH-2', '']);
    const { report } = checkTable(await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), lookups, [RACK], ids());
    expect(report.rows.map((r) => [r.row, r.issues])).toEqual([[3, [{ column: 'location_id', code: 'required' }]]]);
  });
});
