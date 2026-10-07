import 'server-only';

/**
 * Import Excel cho Equipment (docs/DETAIL_MODEL.md mục 6, DATABASE_MODIFIED.md mục 2 + 5).
 *
 * - File mẫu sinh lúc tải: danh sách chọn (Part number, Type, Level,
 *   Location) lấy từ Configuration ngay lúc đó nên luôn khớp với app. Dòng 1
 *   ghi chú từng cột nhận gì, dòng 2 là tiêu đề; cột chọn có ô thả xuống, bấm
 *   vào ô hiện chú thích; sheet Hướng dẫn + sheet Giá trị hợp lệ.
 * - Kiểm tra cùng quy tắc với form Thêm thiết bị. Giá trị chọn tìm theo
 *   display_name (không phân biệt hoa / thường); chưa có hoặc đã ẩn → lỗi, không tự tạo.
 * - Thiết bị cha: tìm theo serial (+ part number nếu serial trùng) trong thiết
 *   bị đã có hoặc các dòng khác của file, thứ tự dòng không quan trọng. Có cha
 *   thì vị trí theo cha (cả chuỗi cha trong file); chặn vòng lặp.
 * - Tất cả hoặc không: còn dòng lỗi thì không ghi; ghi một lần qua RPC
 *   equipment_import (một giao dịch, lịch sử CREATE với source = import).
 */
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { rpc, selectAll } from './core/db';
import { loadLookups, nameOf, partNumberType, toOptions, type Lookups } from './core/lookups';
import { AppError } from '@/lib/errors';
import { textFor, type Language } from '@/lib/i18n/text';
import {
  IMPORT_COLUMNS, IMPORT_MAX_FILE_MB, IMPORT_MAX_ROWS,
  type ImportColumn, type ImportColumnKey, type ImportFileError, type ImportIssue,
  type ImportListKey, type ImportReport, type ImportRowReport,
} from '@/lib/equipmentImport';

// ---------------------------------------------------------------------------
// Giá trị chọn được
// ---------------------------------------------------------------------------

export type ImportChoices = Record<ImportListKey, string[]>;

/** Giá trị chọn được cho thiết bị mới — đang dùng, đúng thứ tự Configuration. */
export function importChoices(lookups: Lookups): ImportChoices {
  const options = toOptions(lookups);
  const active = (items: { display_name: string; is_active: boolean }[]) =>
    items.filter((i) => i.is_active).map((i) => i.display_name);
  return {
    part_numbers: active(options.part_numbers),
    types: active(options.types),
    levels: active(options.levels),
    locations: active(options.locations),
  };
}

// ---------------------------------------------------------------------------
// File mẫu
// ---------------------------------------------------------------------------

export const PRUSSIAN = 'FF002B49';
export const NOTE_FILL = 'FFEAF6FC';
export const NOTE_INK = 'FF33495C';
export const STAR = 'FFFFD54F';
/** Ghi chú dòng 1 chỉ liệt kê nguyên danh sách khi danh sách ngắn. */
export const SHORT_LIST = 80;

export type Text = ReturnType<typeof textFor>;
type Validations = { add(range: string, validation: Record<string, unknown>): void };
export const validationsOf = (ws: ExcelJS.Worksheet) => (ws as unknown as { dataValidations: Validations }).dataValidations;

export const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Danh sách (cột ở sheet Giá trị hợp lệ) theo thứ tự cột của file; Part number dùng chung cho cột cha. */
const LIST_KEYS = [...new Set(IMPORT_COLUMNS.flatMap((c) => (c.list ? [c.list] : [])))];

/** Quy tắc riêng của từng cột (ngoài bắt buộc / độ dài / danh sách). */
function extraRules(col: ImportColumn, choices: ImportChoices, t: Text): string[] {
  switch (col.key) {
    case 'serial_number': return [t('imp.tpl.serialDuplicate')];
    case 'type_id': return [t('imp.tpl.typeFromPart')];
    case 'level_id': return [t('imp.tpl.levelParent')];
    default: return [];
  }
}

/** Ghi chú ngắn của một cột — dòng 1 của sheet nhập và chú thích khi bấm vào ô. */
function columnNote(col: ImportColumn, choices: ImportChoices, t: Text, valuesSheet: string): string {
  const parts: string[] = [];
  if (col.required) parts.push(t('imp.tpl.required'));
  if (col.requiredUnlessParent) parts.push(t('imp.tpl.requiredUnlessParent'));
  if (col.key === 'parent_serial') parts.push(t('imp.tpl.parentSerial'));
  if (col.key === 'parent_part_number') parts.push(t('imp.tpl.parentPart'));
  if (col.list) {
    const values = choices[col.list];
    const joined = values.join(', ');
    if (!values.length) parts.push(t('imp.tpl.noValues'));
    else if (joined.length <= SHORT_LIST) parts.push(t('imp.tpl.pickShort', { values: joined }));
    else parts.push(t('imp.tpl.pickMany', { count: values.length, sheet: valuesSheet }));
  } else {
    parts.push(t('imp.tpl.text', { max: col.max ?? 0 }));
  }
  return [...parts, ...extraRules(col, choices, t)].join(' · ');
}

/** Ước lượng chiều cao dòng (Excel không tự giãn dòng có chữ xuống dòng). */
export function fitHeight(texts: { text: string; width: number }[], lineHeight = 15): number {
  const lines = Math.max(1, ...texts.map(({ text, width }) =>
    text.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / Math.max(width * 1.05, 1))), 0)));
  return Math.min(lines * lineHeight + 4, 409);
}

export async function buildTemplate(lookups: Lookups, language: Language, now = new Date()): Promise<Buffer> {
  const t = textFor(language);
  const choices = importChoices(lookups);
  const dataName = 'Equipment';
  const guideName = t('imp.tpl.sheetGuide');
  const valuesName = t('imp.tpl.sheetValues');
  const errorTitle = clip(t('imp.tpl.errorTitle'), 32);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Equipment Management';
  wb.created = now;

  // ---- Sheet nhập: dòng 1 ghi chú, dòng 2 tiêu đề, nhập từ dòng 3.
  const ws = wb.addWorksheet(dataName, { views: [{ state: 'frozen', ySplit: 2, activeCell: 'A3' }] });
  const lastRow = IMPORT_MAX_ROWS + 2;
  const notes = IMPORT_COLUMNS.map((col) => columnNote(col, choices, t, valuesName));
  IMPORT_COLUMNS.forEach((col, i) => {
    const text = notes[i] ?? '';
    const column = ws.getColumn(i + 1);
    column.width = col.width;
    // Ô dạng chữ: giữ số 0 đầu serial, Level "1" khớp đúng danh sách thả xuống.
    column.numFmt = '@';

    const note = ws.getCell(1, i + 1);
    note.value = text;
    note.font = { size: 9, italic: true, color: { argb: NOTE_INK } };
    note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NOTE_FILL } };
    note.alignment = { wrapText: true, vertical: 'top' };

    const header = ws.getCell(2, i + 1);
    const font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.value = col.required || col.requiredUnlessParent
      ? { richText: [{ text: col.header, font }, { text: ' *', font: { bold: true, color: { argb: STAR } } }] }
      : col.header;
    header.font = font;
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRUSSIAN } };
    header.alignment = { vertical: 'middle' };

    const range = `${column.letter}3:${column.letter}${lastRow}`;
    const prompt = { showInputMessage: true, promptTitle: clip(col.header, 32), prompt: clip(text, 255) };
    if (col.list) {
      const count = choices[col.list].length;
      const letter = String.fromCharCode(65 + LIST_KEYS.indexOf(col.list)); // cột của danh sách ở sheet Giá trị hợp lệ
      // Part number của thiết bị cha có thể là mã đã ẩn → chỉ cảnh báo, không chặn.
      const strict = col.key !== 'parent_part_number';
      validationsOf(ws).add(range, count
        ? {
          type: 'list', allowBlank: true, formulae: [`'${valuesName}'!$${letter}$2:$${letter}$${count + 1}`], ...prompt,
          showErrorMessage: true, errorStyle: strict ? 'stop' : 'warning', errorTitle, error: clip(t('imp.tpl.errorList'), 255),
        }
        : { type: 'any', ...prompt });
    } else {
      validationsOf(ws).add(range, {
        type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [col.max], ...prompt,
        showErrorMessage: true, errorStyle: 'stop', errorTitle, error: clip(t('imp.tpl.errorText', { max: col.max ?? 0 }), 255),
      });
    }
  });
  ws.getRow(1).height = fitHeight(IMPORT_COLUMNS.map((c, i) => ({ text: notes[i] ?? '', width: c.width * 1.15 })), 12);
  ws.getRow(2).height = 20;

  // ---- Hướng dẫn
  const guide = wb.addWorksheet(guideName);
  guide.columns = [{ width: 22 }, { width: 14 }, { width: 58 }, { width: 58 }];
  const time = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now);
  guide.getCell('A1').value = t('imp.tpl.guideTitle');
  guide.getCell('A1').font = { bold: true, size: 14, color: { argb: PRUSSIAN } };
  guide.getCell('A2').value = t('imp.tpl.generated', { time });
  guide.getCell('A2').font = { italic: true, color: { argb: NOTE_INK } };
  const steps = [
    t('imp.tpl.step1', { sheet: dataName }), t('imp.tpl.step2'), t('imp.tpl.step3'), t('imp.tpl.stepParent'),
    t('imp.tpl.step4', { max: IMPORT_MAX_ROWS }),
  ];
  steps.forEach((step, i) => {
    const r = 4 + i;
    guide.mergeCells(r, 1, r, 4);
    const cell = guide.getCell(r, 1);
    cell.value = `${i + 1}. ${step}`;
    cell.alignment = { wrapText: true, vertical: 'top' };
    guide.getRow(r).height = fitHeight([{ text: cell.value, width: 140 }]);
  });
  const headRow = 4 + steps.length + 1;
  guide.getRow(headRow).values = [t('imp.tpl.colColumn'), t('imp.tpl.colRequired'), t('imp.tpl.colRule'), t('imp.tpl.colValues')];
  guide.getRow(headRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRUSSIAN } };
  });
  IMPORT_COLUMNS.forEach((col, i) => {
    const r = headRow + 1 + i;
    const rules: string[] = [];
    let values = '';
    if (col.key === 'parent_serial') rules.push(t('imp.tpl.parentSerial'));
    if (col.key === 'parent_part_number') rules.push(t('imp.tpl.parentPart'));
    if (col.list) {
      if (col.key !== 'parent_part_number') {
        rules.push(t('imp.tpl.pick', { page: col.page ?? col.header }));
      }
      const list = choices[col.list];
      const joined = list.join(', ');
      values = !list.length ? t('imp.tpl.noValues')
        : joined.length <= 400 ? joined : t('imp.tpl.pickMany', { count: list.length, sheet: valuesName });
    } else {
      rules.push(t('imp.tpl.text', { max: col.max ?? 0 }));
    }
    if (col.requiredUnlessParent) rules.push(t('imp.tpl.locationParent'));
    rules.push(...extraRules(col, choices, t));
    const rule = rules.join(' — ');
    const required = col.required ? t('imp.tpl.yes') : col.requiredUnlessParent ? t('imp.tpl.yesUnlessParent') : t('imp.tpl.no');

    const row = guide.getRow(r);
    row.values = [col.header, required, rule, values];
    row.getCell(1).font = { bold: true };
    if (col.required || col.requiredUnlessParent) row.getCell(2).font = { bold: true, color: { argb: 'FFC00000' } };
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: 'top' }; });
    row.height = fitHeight([{ text: required, width: 14 }, { text: rule, width: 58 }, { text: values, width: 58 }]);
  });

  // ---- Giá trị hợp lệ (nguồn của các ô thả xuống — không sửa ở đây).
  const vs = wb.addWorksheet(valuesName, { views: [{ state: 'frozen', ySplit: 1 }] });
  LIST_KEYS.forEach((list, i) => {
    const col = IMPORT_COLUMNS.find((c) => c.list === list)!;
    const column = vs.getColumn(i + 1);
    column.width = Math.max(col.width, ...choices[list].map((v) => Math.min(v.length + 2, 60)));
    column.numFmt = '@';
    const header = vs.getCell(1, i + 1);
    header.value = col.header;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRUSSIAN } };
    choices[list].forEach((value, j) => { vs.getCell(j + 2, i + 1).value = value; });
  });
  await vs.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: true });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function equipmentImportTemplate(language: Language): Promise<Buffer> {
  return buildTemplate(await loadLookups(), language);
}

// ---------------------------------------------------------------------------
// Đọc file
// ---------------------------------------------------------------------------

export type SheetTable = { headers: string[]; rows: { row: number; cells: string[] }[] };

export function fileError(code: ImportFileError, extra: Record<string, unknown> = {}): AppError {
  return new AppError('VALIDATION_ERROR', { fields: { file: code }, ...extra });
}

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Tiêu đề cột → trường. Nhận cả "Serial number *", "SERIAL NUMBER", "serial_number". */
export function headerKeys<K extends string>(columns: readonly { key: K; header: string }[]): Map<string, K> {
  return new Map(columns.flatMap((c) => [
    [normalize(c.header), c.key] as const,
    [normalize(c.key), c.key] as const,
    [normalize(c.key.replace(/_id$/, '')), c.key] as const,
  ]));
}
const HEADER_KEYS = headerKeys(IMPORT_COLUMNS);

/** Chữ trong ô — số, công thức, rich text, link đều về chuỗi đã cắt khoảng trắng. */
export function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('formula' in value || 'sharedFormula' in value) {
      return cellText((value as { result?: ExcelJS.CellValue }).result);
    }
    if ('text' in value) return cellText(value.text as ExcelJS.CellValue);
    if ('error' in value) return '';
  }
  return String(value).trim();
}

/**
 * Sheet có cột Serial number trong 5 dòng đầu; dòng đó là tiêu đề, dữ liệu
 * ở các dòng bên dưới (bỏ dòng trống). File mẫu: dòng 1 ghi chú, dòng 2 tiêu đề.
 */
export async function readWorkbook(buffer: Buffer, keys: Map<string, string> = HEADER_KEYS): Promise<SheetTable> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fileError('unreadable');
  }
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const headers: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) headers.push(cellText(row.getCell(c).value));
      if (!headers.some((h) => keys.get(normalize(h)) === 'serial_number')) continue;

      const rows: SheetTable['rows'] = [];
      ws.eachRow({ includeEmpty: false }, (dataRow, number) => {
        if (number <= r) return;
        const cells = headers.map((_h, c) => cellText(dataRow.getCell(c + 1).value));
        if (cells.some(Boolean)) rows.push({ row: number, cells });
      });
      return { headers, rows };
    }
  }
  return { headers: [], rows: [] };
}

// ---------------------------------------------------------------------------
// Kiểm tra
// ---------------------------------------------------------------------------

export type Entry = { id: string; usable: boolean; name: string; requiresRemark: boolean };

export function indexBy<T extends { id: string; display_name: string }>(map: Map<string, T>, usable: (row: T) => boolean, remark?: (row: T) => boolean) {
  const out = new Map<string, Entry>();
  map.forEach((row) => out.set(row.display_name.trim().toLowerCase(), {
    id: row.id, usable: usable(row), name: row.display_name, requiresRemark: remark?.(row) ?? false,
  }));
  return out;
}

export const serialKey = (serial: string) => serial.trim().toLowerCase();

/** Thiết bị đã có — để tìm thiết bị cha và cảnh báo serial trùng. */
export type ExistingEquipment = {
  id: string; serial_number: string; part_number_id: string | null; location_id: string; level_id: string | null;
};

/** Một dòng sẽ ghi — đúng tên cột của bảng equipments. */
export type InsertRow = {
  id: string; serial_number: string | null; part_number_id: string | null; jabil_id: string | null; asset: string | null;
  type_id: string | null; level_id: string | null; location_id: string | null;
  parent_id: string | null; remark: string | null;
};

type Parent = { existing: ExistingEquipment } | { row: number };

type Work = {
  source: SheetTable['rows'][number];
  issues: ImportIssue[];
  data: InsertRow;
  /** Chữ trong ô (đã cắt khoảng trắng). */
  cell: (key: ImportColumnKey) => string;
  parent: Parent | null;
};

const DB_KEYS = ['serial_number', 'part_number_id', 'jabil_id', 'asset', 'type_id', 'level_id', 'location_id', 'remark'] as const;

/** Kiểm tra từng dòng như form Thêm thiết bị; trả báo cáo + các dòng sẽ ghi. */
export function checkTable(
  table: SheetTable, lookups: Lookups, existing: ExistingEquipment[], newId: () => string = randomUUID,
): { report: ImportReport; inserts: InsertRow[] } {
  const columnIndex = new Map<ImportColumnKey, number>();
  const ignored: string[] = [];
  table.headers.forEach((h, i) => {
    if (!h) return;
    const key = HEADER_KEYS.get(normalize(h));
    if (key && !columnIndex.has(key)) columnIndex.set(key, i);
    else ignored.push(h);
  });
  const missing = IMPORT_COLUMNS
    .filter((c) => !columnIndex.has(c.key) && (c.required || (c.requiredUnlessParent && !columnIndex.has('parent_serial'))))
    .map((c) => c.header);
  if (missing.length) throw fileError('missing_columns', { columns: missing });
  if (!table.rows.length) throw fileError('empty');
  if (table.rows.length > IMPORT_MAX_ROWS) throw fileError('too_many_rows', { count: table.rows.length, max: IMPORT_MAX_ROWS });

  const lists: Record<ImportListKey, Map<string, Entry>> = {
    part_numbers: indexBy(lookups.part_numbers, (r) => r.is_active),
    types: indexBy(lookups.types, (r) => r.is_active),
    levels: indexBy(lookups.levels, (r) => r.is_active),
    locations: indexBy(lookups.locations, (r) => r.is_active),
  };

  // ---- 1. Từng ô như form Thêm thiết bị.
  const works: Work[] = table.rows.map((source) => {
    const cell = (key: ImportColumnKey) => {
      const index = columnIndex.get(key);
      return index === undefined ? '' : source.cells[index] ?? '';
    };
    const issues: ImportIssue[] = [];
    const data = { id: newId(), parent_id: null } as InsertRow;
    for (const key of DB_KEYS) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key)!;
      const raw = cell(key);
      data[key] = null;
      if (!raw) {
        if (col.required || (col.requiredUnlessParent && !cell('parent_serial'))) issues.push({ column: key, code: 'required' });
        continue;
      }
      if (col.list) {
        const entry = lists[col.list].get(raw.toLowerCase());
        if (!entry) issues.push({ column: key, code: 'not_found', value: raw });
        else if (!entry.usable) issues.push({ column: key, code: 'inactive', value: raw });
        else {
          data[key] = entry.id;
        }
      } else if (col.max && raw.length > col.max) {
        issues.push({ column: key, code: 'too_long', max: col.max });
      } else {
        data[key] = raw;
      }
    }
    // Type theo part number (như Location theo cha): ô trống hoặc đúng Type đó (kể cả Type đã ẩn) → lấy
    // theo part number; ghi Type khác → một lỗi duy nhất cho ô này.
    const partType = partNumberType(lookups, data.part_number_id);
    if (partType) {
      const partTypeName = nameOf(lookups.types, partType) ?? '';
      for (let i = issues.length - 1; i >= 0; i--) if (issues[i]!.column === 'type_id') issues.splice(i, 1);
      if (cell('type_id') && cell('type_id').toLowerCase() !== partTypeName.toLowerCase()) {
        issues.push({ column: 'type_id', code: 'type_follows_part_number', value: partTypeName });
      }
      data.type_id = partType;
    }
    if (cell('parent_serial').length > 200) issues.push({ column: 'parent_serial', code: 'too_long', max: 200 });
    if (cell('parent_part_number') && !cell('parent_serial')) issues.push({ column: 'parent_serial', code: 'required' });
    return { source, issues, data, cell, parent: null };
  });

  // ---- 2. Thiết bị cha: thiết bị đã có hoặc dòng khác trong file (serial, + part number nếu trùng).
  const existingBySerial = new Map<string, ExistingEquipment[]>();
  existing.forEach((e) => {
    const key = serialKey(e.serial_number);
    existingBySerial.set(key, [...(existingBySerial.get(key) ?? []), e]);
  });
  const rowsBySerial = new Map<string, number[]>();
  works.forEach((w, i) => {
    const serial = w.cell('serial_number');
    if (serial) rowsBySerial.set(serialKey(serial), [...(rowsBySerial.get(serialKey(serial)) ?? []), i]);
  });
  works.forEach((w, i) => {
    const serial = w.cell('parent_serial');
    if (!serial || serial.length > 200) return;
    const part = w.cell('parent_part_number').toLowerCase();
    const key = serialKey(serial);
    const candidates: { parent: Parent; part: string }[] = [
      ...(existingBySerial.get(key) ?? []).map((e) => ({
        parent: { existing: e }, part: (nameOf(lookups.part_numbers, e.part_number_id) ?? '').toLowerCase(),
      })),
      ...(rowsBySerial.get(key) ?? []).filter((j) => j !== i).map((j) => ({
        parent: { row: j }, part: works[j]!.cell('part_number_id').toLowerCase(),
      })),
    ].filter((c) => !part || c.part === part);
    const shown = part ? `${serial} · ${w.cell('parent_part_number')}` : serial;
    if (candidates.length === 0) w.issues.push({ column: 'parent_serial', code: 'parent_not_found', value: shown });
    else if (candidates.length > 1) w.issues.push({ column: 'parent_serial', code: 'parent_ambiguous', value: shown, count: candidates.length });
    else w.parent = candidates[0]!.parent;
  });

  // ---- 3. Vị trí + Level theo cha (theo cả chuỗi cha trong file); chặn vòng lặp.
  const locationNames = lookups.locations;
  works.forEach((w) => {
    if (!w.parent) return;
    const seen = new Set<Work>([w]);
    let current: Work = w;
    let location: string | null = null;
    let level: string | null = null;
    let cycle = false;
    for (;;) {
      const parent: Parent | null = current.parent;
      if (!parent) { location = current.data.location_id; level = current.data.level_id; break; }
      if ('existing' in parent) { location = parent.existing.location_id; level = parent.existing.level_id; break; }
      const next = works[parent.row]!;
      if (seen.has(next)) { cycle = true; break; }
      seen.add(next);
      current = next;
    }
    if (cycle) {
      w.issues.push({ column: 'parent_serial', code: 'parent_cycle', value: w.cell('parent_serial') });
      return;
    }
    if (w.data.location_id && location && w.data.location_id !== location) {
      w.issues.push({ column: 'location_id', code: 'location_follows_parent', value: nameOf(locationNames, location) ?? '' });
    }
    w.data.location_id = location;
    // Level: ô trống hoặc đúng Level của cha (kể cả Level đã ẩn) → theo cha; Level khác → một lỗi cho ô này.
    const levelName = nameOf(lookups.levels, level) ?? '';
    if (w.cell('level_id')) {
      w.issues = w.issues.filter((i) => i.column !== 'level_id');
      if (w.cell('level_id').toLowerCase() !== levelName.toLowerCase()) {
        w.issues.push({ column: 'level_id', code: 'level_follows_parent', value: levelName || '—' });
      }
    }
    w.data.level_id = level;
    w.data.parent_id = 'existing' in w.parent ? w.parent.existing.id : works[w.parent.row]!.data.id;
  });

  // ---- 4. Serial trùng (chỉ cảnh báo) + báo cáo.
  const existingSerials = new Set(existingBySerial.keys());
  const firstRowOfSerial = new Map<string, number>();
  const rows: ImportRowReport[] = [];
  const inserts: InsertRow[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const w of works) {
    let duplicateOf: ImportRowReport['duplicate_of'] = null;
    if (w.data.serial_number) {
      const key = serialKey(w.data.serial_number);
      if (existingSerials.has(key)) duplicateOf = 'existing';
      else if (firstRowOfSerial.has(key)) duplicateOf = firstRowOfSerial.get(key)!;
      else firstRowOfSerial.set(key, w.source.row);
    }
    if (w.issues.length) invalid++;
    if (duplicateOf !== null) duplicates++;
    if (w.issues.length || duplicateOf !== null) {
      rows.push({ row: w.source.row, serial_number: w.cell('serial_number') || null, issues: w.issues, duplicate_of: duplicateOf });
    }
    if (!w.issues.length) inserts.push(w.data);
  }

  return {
    report: {
      total: works.length, valid: works.length - invalid, invalid, duplicates,
      committed: false, created: 0, ignored_columns: ignored, rows,
    },
    inserts,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type UploadedFile = Blob & { name?: string };

/** File upload hợp lệ (có, .xlsx, không quá lớn) → nội dung. */
export async function readUpload(file: UploadedFile | null): Promise<Buffer> {
  if (!file || !file.size) throw fileError('required');
  if (!/\.xlsx$/i.test(file.name ?? '')) throw fileError('not_xlsx');
  if (file.size > IMPORT_MAX_FILE_MB * 1024 * 1024) throw fileError('too_large', { max: IMPORT_MAX_FILE_MB });
  return Buffer.from(await file.arrayBuffer());
}

/** commit = false: chỉ kiểm tra. commit = true: kiểm tra lại từ đầu, hết lỗi mới ghi (tất cả hoặc không). */
export async function importEquipmentFile(file: UploadedFile | null, commit: boolean, actor: string): Promise<ImportReport> {
  const table = await readWorkbook(await readUpload(file));
  const [lookups, existing] = await Promise.all([
    loadLookups(),
    selectAll<ExistingEquipment>('equipments', 'id, serial_number, part_number_id, location_id, level_id'),
  ]);
  const { report, inserts } = checkTable(table, lookups, existing);
  if (!commit || report.invalid > 0) return report;

  const created = await rpc<number>('equipment_import', { p_rows: inserts, p_actor: actor });
  return { ...report, committed: true, created };
}
