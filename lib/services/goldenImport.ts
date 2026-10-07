import 'server-only';

/**
 * Import Excel cho Golden sample — cùng cách làm với Equipment (equipmentImport.ts):
 * file mẫu sinh lúc tải (Location lấy từ Configuration ngay lúc đó),
 * kiểm tra từng dòng như form Thêm golden sample, tất cả hoặc không, ghi một
 * lần qua RPC golden_import (lịch sử CREATE với source = import).
 * Khác Equipment: Part number là chữ tự do (không phải Configuration), không có thiết bị cha.
 */
import ExcelJS from 'exceljs';
import { rpc, selectAll } from './core/db';
import { loadLookups, type Lookups } from './core/lookups';
import {
  NOTE_FILL, NOTE_INK, PRUSSIAN, SHORT_LIST, STAR,
  clip, fileError, fitHeight, headerKeys, importChoices, indexBy, normalize, readUpload, readWorkbook, serialKey, validationsOf,
  type Entry, type SheetTable, type Text, type UploadedFile,
} from './equipmentImport';
import { textFor, type Language } from '@/lib/i18n/text';
import { GOLDEN_IMPORT_COLUMNS, type GoldenImportColumn, type GoldenImportColumnKey, type GoldenImportListKey } from '@/lib/goldenImport';
import { IMPORT_MAX_ROWS, type ImportIssue, type ImportReport, type ImportRowReport } from '@/lib/equipmentImport';

const HEADER_KEYS = headerKeys(GOLDEN_IMPORT_COLUMNS);
const LIST_KEYS = [...new Set(GOLDEN_IMPORT_COLUMNS.flatMap((c) => (c.list ? [c.list] : [])))];
const DATA_SHEET = 'Golden';

/** Một dòng sẽ ghi — đúng tên cột của bảng golden_samples. */
export type GoldenInsertRow = Record<GoldenImportColumnKey, string | null>;

// ---------------------------------------------------------------------------
// File mẫu
// ---------------------------------------------------------------------------

type Choices = Pick<ReturnType<typeof importChoices>, GoldenImportListKey>;

function extraRules(col: GoldenImportColumn, choices: Choices, t: Text): string[] {
  switch (col.key) {
    case 'serial_number': return [t('imp.tpl.serialDuplicate')];
    default: return [];
  }
}

/** Ghi chú ngắn của một cột — dòng 1 của sheet nhập và chú thích khi bấm vào ô. */
function columnNote(col: GoldenImportColumn, choices: Choices, t: Text, valuesSheet: string): string {
  const parts: string[] = [];
  if (col.required) parts.push(t('imp.tpl.required'));
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

export async function buildGoldenTemplate(lookups: Lookups, language: Language, now = new Date()): Promise<Buffer> {
  const t = textFor(language);
  const choices = importChoices(lookups);
  const guideName = t('imp.tpl.sheetGuide');
  const valuesName = t('imp.tpl.sheetValues');
  const errorTitle = clip(t('imp.tpl.errorTitle'), 32);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Equipment Management';
  wb.created = now;

  // ---- Sheet nhập: dòng 1 ghi chú, dòng 2 tiêu đề, nhập từ dòng 3.
  const ws = wb.addWorksheet(DATA_SHEET, { views: [{ state: 'frozen', ySplit: 2, activeCell: 'A3' }] });
  const lastRow = IMPORT_MAX_ROWS + 2;
  const notes = GOLDEN_IMPORT_COLUMNS.map((col) => columnNote(col, choices, t, valuesName));
  GOLDEN_IMPORT_COLUMNS.forEach((col, i) => {
    const text = notes[i] ?? '';
    const column = ws.getColumn(i + 1);
    column.width = col.width;
    column.numFmt = '@'; // ô dạng chữ: giữ số 0 đầu serial / part number

    const note = ws.getCell(1, i + 1);
    note.value = text;
    note.font = { size: 9, italic: true, color: { argb: NOTE_INK } };
    note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NOTE_FILL } };
    note.alignment = { wrapText: true, vertical: 'top' };

    const header = ws.getCell(2, i + 1);
    const font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.value = col.required
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
      validationsOf(ws).add(range, count
        ? {
          type: 'list', allowBlank: true, formulae: [`'${valuesName}'!$${letter}$2:$${letter}$${count + 1}`], ...prompt,
          showErrorMessage: true, errorStyle: 'stop', errorTitle, error: clip(t('imp.tpl.errorList'), 255),
        }
        : { type: 'any', ...prompt });
    } else {
      validationsOf(ws).add(range, {
        type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [col.max], ...prompt,
        showErrorMessage: true, errorStyle: 'stop', errorTitle, error: clip(t('imp.tpl.errorText', { max: col.max ?? 0 }), 255),
      });
    }
  });
  ws.getRow(1).height = fitHeight(GOLDEN_IMPORT_COLUMNS.map((c, i) => ({ text: notes[i] ?? '', width: c.width * 1.15 })), 12);
  ws.getRow(2).height = 20;

  // ---- Hướng dẫn
  const guide = wb.addWorksheet(guideName);
  guide.columns = [{ width: 22 }, { width: 14 }, { width: 58 }, { width: 58 }];
  const time = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now);
  guide.getCell('A1').value = t('gimp.tpl.guideTitle');
  guide.getCell('A1').font = { bold: true, size: 14, color: { argb: PRUSSIAN } };
  guide.getCell('A2').value = t('imp.tpl.generated', { time });
  guide.getCell('A2').font = { italic: true, color: { argb: NOTE_INK } };
  const steps = [
    t('gimp.tpl.step1', { sheet: DATA_SHEET }), t('imp.tpl.step2'), t('imp.tpl.step3'), t('gimp.tpl.step4', { max: IMPORT_MAX_ROWS }),
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
  GOLDEN_IMPORT_COLUMNS.forEach((col, i) => {
    const rules: string[] = [];
    let values = '';
    if (col.list) {
      rules.push(t('imp.tpl.pick', { page: col.page ?? col.header }));
      const list = choices[col.list];
      const joined = list.join(', ');
      values = !list.length ? t('imp.tpl.noValues')
        : joined.length <= 400 ? joined : t('imp.tpl.pickMany', { count: list.length, sheet: valuesName });
    } else {
      rules.push(t('imp.tpl.text', { max: col.max ?? 0 }));
    }
    rules.push(...extraRules(col, choices, t));
    const rule = rules.join(' — ');
    const required = col.required ? t('imp.tpl.yes') : t('imp.tpl.no');

    const row = guide.getRow(headRow + 1 + i);
    row.values = [col.header, required, rule, values];
    row.getCell(1).font = { bold: true };
    if (col.required) row.getCell(2).font = { bold: true, color: { argb: 'FFC00000' } };
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: 'top' }; });
    row.height = fitHeight([{ text: required, width: 14 }, { text: rule, width: 58 }, { text: values, width: 58 }]);
  });

  // ---- Giá trị hợp lệ (nguồn của các ô thả xuống — không sửa ở đây).
  const vs = wb.addWorksheet(valuesName, { views: [{ state: 'frozen', ySplit: 1 }] });
  LIST_KEYS.forEach((list, i) => {
    const col = GOLDEN_IMPORT_COLUMNS.find((c) => c.list === list)!;
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

export async function goldenImportTemplate(language: Language): Promise<Buffer> {
  return buildGoldenTemplate(await loadLookups(), language);
}

// ---------------------------------------------------------------------------
// Kiểm tra
// ---------------------------------------------------------------------------

/** Kiểm tra từng dòng như form Thêm golden sample; trả báo cáo + các dòng sẽ ghi. */
export function checkGoldenTable(
  table: SheetTable, lookups: Lookups, existingSerials: string[],
): { report: ImportReport; inserts: GoldenInsertRow[] } {
  const columnIndex = new Map<GoldenImportColumnKey, number>();
  const ignored: string[] = [];
  table.headers.forEach((h, i) => {
    if (!h) return;
    const key = HEADER_KEYS.get(normalize(h));
    if (key && !columnIndex.has(key)) columnIndex.set(key, i);
    else ignored.push(h);
  });
  const missing = GOLDEN_IMPORT_COLUMNS.filter((c) => c.required && !columnIndex.has(c.key)).map((c) => c.header);
  if (missing.length) throw fileError('missing_columns', { columns: missing });
  if (!table.rows.length) throw fileError('empty');
  if (table.rows.length > IMPORT_MAX_ROWS) throw fileError('too_many_rows', { count: table.rows.length, max: IMPORT_MAX_ROWS });

  const lists: Record<GoldenImportListKey, Map<string, Entry>> = {
    locations: indexBy(lookups.locations, (r) => r.is_active),
  };
  const existing = new Set(existingSerials.map(serialKey));
  const firstRowOfSerial = new Map<string, number>();
  const rows: ImportRowReport[] = [];
  const inserts: GoldenInsertRow[] = [];
  let invalid = 0;
  let duplicates = 0;

  for (const source of table.rows) {
    const issues: ImportIssue[] = [];
    const data = {} as GoldenInsertRow;
    for (const col of GOLDEN_IMPORT_COLUMNS) {
      const index = columnIndex.get(col.key);
      const raw = index === undefined ? '' : source.cells[index] ?? '';
      data[col.key] = null;
      if (!raw) {
        if (col.required) issues.push({ column: col.key, code: 'required' });
      } else if (col.list) {
        const entry = lists[col.list].get(raw.toLowerCase());
        if (!entry) issues.push({ column: col.key, code: 'not_found', value: raw });
        else if (!entry.usable) issues.push({ column: col.key, code: 'inactive', value: raw });
        else {
          data[col.key] = entry.id;
        }
      } else if (col.max && raw.length > col.max) {
        issues.push({ column: col.key, code: 'too_long', max: col.max });
      } else {
        data[col.key] = raw;
      }
    }

    let duplicateOf: ImportRowReport['duplicate_of'] = null;
    if (data.serial_number) {
      const key = serialKey(data.serial_number);
      if (existing.has(key)) duplicateOf = 'existing';
      else if (firstRowOfSerial.has(key)) duplicateOf = firstRowOfSerial.get(key)!;
      else firstRowOfSerial.set(key, source.row);
    }
    if (issues.length) invalid++;
    if (duplicateOf !== null) duplicates++;
    if (issues.length || duplicateOf !== null) {
      rows.push({ row: source.row, serial_number: data.serial_number, issues, duplicate_of: duplicateOf });
    }
    if (!issues.length) inserts.push(data);
  }

  return {
    report: {
      total: table.rows.length, valid: table.rows.length - invalid, invalid, duplicates,
      committed: false, created: 0, ignored_columns: ignored, rows,
    },
    inserts,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** commit = false: chỉ kiểm tra. commit = true: kiểm tra lại từ đầu, hết lỗi mới ghi (tất cả hoặc không). */
export async function importGoldenFile(file: UploadedFile | null, commit: boolean, actor: string): Promise<ImportReport> {
  const table = await readWorkbook(await readUpload(file), HEADER_KEYS);
  const [lookups, existing] = await Promise.all([
    loadLookups(),
    selectAll<{ serial_number: string }>('golden_samples', 'serial_number'),
  ]);
  const { report, inserts } = checkGoldenTable(table, lookups, existing.map((r) => r.serial_number));
  if (!commit || report.invalid > 0) return report;

  const created = await rpc<number>('golden_import', { p_rows: inserts, p_actor: actor });
  return { ...report, committed: true, created };
}
