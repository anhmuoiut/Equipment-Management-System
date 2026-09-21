import 'server-only';

/**
 * Bulk import from a spreadsheet.
 *
 * Reuses the exact same validation and creation path as the manual "New
 * equipment" form (`validateFields` + `createEquipmentFromFields`) — this
 * file only adds spreadsheet-specific steps: parsing the file, and
 * translating human text (a Type/Status/Level's display name, a location's
 * code, a parent's Part+Serial pair) into the ids/values those functions
 * expect. That split means a business rule never has to be written twice.
 *
 * Import is all-or-nothing, and scoped to system fields only (Type/Status/
 * Level/Location/Calibration Required plus the plain text/textarea system
 * fields) — admin-created custom fields aren't part of the fixed column
 * template and are out of scope for bulk import in this phase; they can be
 * filled in afterward through the normal Edit form.
 *
 * A row can reference another row earlier in the same file as its parent
 * (so a file can be entered top-down: parents before children), but never
 * a later one — that keeps parent resolution a single top-to-bottom pass
 * with no cycle detection needed, since a row can only ever point
 * "backwards".
 */
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';
import { validateFields, type FieldDefinition } from '@/lib/validators/equipment';
import {
  getFieldDefinitions, getEditableFieldKeys, getActiveRefLookup,
  createEquipmentFromFields, findDuplicates,
} from '@/lib/services/equipment';
import { assertFields, isAdmin, type UserProfile } from '@/lib/permissions';

const MAX_ROWS = 500;

const COLUMNS = [
  'Status', 'Jabil ID', 'Part Number', 'Serial Number', 'Asset', 'Type', 'Level',
  'Calibration Required', 'Location', 'Remark', 'Parent Part Number', 'Parent Serial Number',
] as const;
type Column = typeof COLUMNS[number];

const COLUMN_TO_FIELD: Partial<Record<Column, string>> = {
  'Status': 'status',
  'Jabil ID': 'jabil_id',
  'Part Number': 'part_number',
  'Serial Number': 'serial_number',
  'Asset': 'asset',
  'Type': 'types',
  'Level': 'level',
  'Calibration Required': 'calibration_required',
  'Remark': 'remark',
};

/** Type/Status/Level are now master-data references, not fixed dropdown
 *  options — this resolves a spreadsheet cell's display name/code text to
 *  the matching row's id, case-insensitively. */
const REF_TABLE: Partial<Record<Column, string>> = {
  Status: 'equipment_statuses', Type: 'equipment_types', Level: 'equipment_levels',
};

// ---------------------------------------------------------------------------
// FILE PARSING — both formats resolve to the same string[][] shape
// (row 0 = header, matching COLUMNS order is validated by caller).
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  // Strip a UTF-8 BOM, which spreadsheet apps love to prepend.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r') {
      // ignore; \n (bare or following \r) ends the row
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      cells.push(
        v === null || v === undefined ? ''
          : typeof v === 'object' && 'text' in v ? String((v as { text: unknown }).text)
          : typeof v === 'object' && 'result' in v ? String((v as { result: unknown }).result)
          : String(v),
      );
    });
    rows.push(cells);
  });
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// ---------------------------------------------------------------------------
// TEMPLATE
// ---------------------------------------------------------------------------

const EXAMPLE_ROW = [
  'Active', 'P10001', 'ST-UNI-M10', '10-UNI-132', '715032', 'Tester', 'Unified',
  'false', 'B3F5', '', '', '',
];

async function listMasterDataNames(table: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from(table).select('display_name').eq('is_active', true).order('display_order');
  if (error) throw mapRpcError(error);
  return (data ?? []).map((r) => (r as { display_name: string }).display_name);
}

export async function generateTemplate(format: 'xlsx' | 'csv'): Promise<{ buffer: Buffer; contentType: string }> {
  if (format === 'csv') {
    const text = [COLUMNS, EXAMPLE_ROW]
      .map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)).join(','))
      .join('\r\n');
    return { buffer: Buffer.from(text, 'utf-8'), contentType: 'text/csv' };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Equipment');
  sheet.addRow([...COLUMNS]).font = { bold: true };
  sheet.addRow(EXAMPLE_ROW);
  sheet.columns.forEach((col) => { col.width = 18; });

  const [types, statuses, levels, locations] = await Promise.all([
    listMasterDataNames('equipment_types'),
    listMasterDataNames('equipment_statuses'),
    listMasterDataNames('equipment_levels'),
    listLocationCodes(),
  ]);
  const reference = workbook.addWorksheet('Valid values (reference)');
  reference.addRow(['Column', 'Valid values']).font = { bold: true };
  reference.addRow(['Status', statuses.join(', ')]);
  reference.addRow(['Type', types.join(', ')]);
  reference.addRow(['Level', levels.join(', ')]);
  reference.addRow(['Calibration Required', 'true, false']);
  reference.addRow(['Location', locations.map((l) => l.code).join(', ')]);
  reference.columns.forEach((col) => { col.width = 40; });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

async function listLocationCodes() {
  const { data, error } = await supabaseAdmin().from('locations').select('code').eq('is_active', true).order('sort_order');
  if (error) throw mapRpcError(error);
  return (data ?? []) as { code: string }[];
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

export type ImportRowResult = {
  row: number;
  status: 'created' | 'error';
  serial_number?: string;
  id?: string;
  errors?: string[];
  duplicate_warning?: boolean;
};

export type ImportReport = {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  rows: ImportRowResult[];
};

type ParentSource = { type: 'db'; id: string } | { type: 'batch'; key: string };

type Resolved = {
  rowNum: number;
  fields: Record<string, string | null>;
  parent: ParentSource | null;
  errors: string[];
};

function batchKey(partNumber: string | null | undefined, serialNumber: string | null | undefined): string {
  return `${(partNumber ?? '').trim().toLowerCase()}|${(serialNumber ?? '').trim().toLowerCase()}`;
}

async function resolveRows(
  dataRows: string[][],
  header: string[],
  defs: FieldDefinition[],
): Promise<Resolved[]> {
  const db = supabaseAdmin();
  const { data: locRows, error: locErr } = await db.from('locations').select('id, code').eq('is_active', true);
  if (locErr) throw mapRpcError(locErr);
  const locByCode = new Map((locRows ?? []).map((l) => [(l as { code: string }).code.toLowerCase(), (l as { id: string }).id]));

  const refByColumn = new Map<Column, Map<string, string>>();
  for (const [col, table] of Object.entries(REF_TABLE) as [Column, string][]) {
    const { data, error } = await db.from(table).select('id, code, display_name').eq('is_active', true);
    if (error) throw mapRpcError(error);
    const map = new Map<string, string>();
    for (const row of (data ?? []) as { id: string; code: string; display_name: string }[]) {
      map.set(row.code.toLowerCase(), row.id);
      map.set(row.display_name.toLowerCase(), row.id);
    }
    refByColumn.set(col, map);
  }

  const colIndex = new Map(header.map((h, i) => [h.trim(), i]));
  const get = (row: string[], col: Column) => {
    const i = colIndex.get(col);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const seenInBatch = new Set<string>();
  const resolved: Resolved[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i]!;
    const rowNum = i + 2; // header is spreadsheet row 1
    const errors: string[] = [];
    const fields: Record<string, string | null> = {};

    for (const col of ['Jabil ID', 'Part Number', 'Serial Number', 'Asset', 'Remark'] as const) {
      const key = COLUMN_TO_FIELD[col]!;
      fields[key] = get(raw, col) || null;
    }

    for (const col of ['Status', 'Type', 'Level'] as const) {
      const key = COLUMN_TO_FIELD[col]!;
      const value = get(raw, col);
      if (!value) { fields[key] = null; continue; }
      const id = refByColumn.get(col)?.get(value.toLowerCase());
      if (!id) errors.push(`${col}: "${value}" is not a recognized active value.`);
      else fields[key] = id;
    }

    // A blank cell stays null (genuinely unanswered), not a silent "false" —
    // otherwise marking this field required in Field configuration could
    // never catch a row that never answered it (validateFields below is
    // what actually enforces is_required for this field).
    const calReqRaw = get(raw, 'Calibration Required').toLowerCase();
    fields.calibration_required = calReqRaw === '' ? null : (calReqRaw === 'true' || calReqRaw === 'yes' || calReqRaw === '1' ? 'true' : 'false');

    if (!fields.serial_number) errors.push('Serial Number is required.');
    try {
      Object.assign(fields, validateFields(fields, defs, 'create'));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors.push(...Object.values(error.details.fields as Record<string, string> ?? {}));
    }

    const parentPart = get(raw, 'Parent Part Number');
    const parentSerial = get(raw, 'Parent Serial Number');
    let parent: ParentSource | null = null;

    if (parentSerial) {
      if (!parentPart) {
        errors.push('Parent Part Number is required when Parent Serial Number is given.');
      } else {
        const key = batchKey(parentPart, parentSerial);
        const { data: existing, error: exErr } = await db.from('equipment')
          .select('id').eq('part_number', parentPart).eq('serial_number', parentSerial)
          .is('archived_at', null).limit(2);
        if (exErr) throw mapRpcError(exErr);
        if ((existing ?? []).length > 1) {
          errors.push(`Parent "${parentPart} | ${parentSerial}" matches more than one existing equipment — resolve the duplicate first, or attach this row via Move after import.`);
        } else if ((existing ?? []).length === 1) {
          parent = { type: 'db', id: (existing![0] as { id: string }).id };
        } else if (seenInBatch.has(key)) {
          parent = { type: 'batch', key };
        } else {
          errors.push(`Parent "${parentPart} | ${parentSerial}" was not found. Make sure the parent row appears earlier in this file, or already exists in the system.`);
        }
      }
    } else if (parentPart) {
      errors.push('Parent Serial Number is required when Parent Part Number is given.');
    }

    if (!parent) {
      const locCode = get(raw, 'Location');
      if (!locCode) {
        errors.push('Location is required when no Parent is given.');
      } else {
        const locId = locByCode.get(locCode.toLowerCase());
        if (!locId) errors.push(`Location "${locCode}" was not found.`);
        else fields.current_location_id = locId;
      }
    }

    if (errors.length === 0 && fields.serial_number) {
      seenInBatch.add(batchKey(fields.part_number, fields.serial_number));
    }

    resolved.push({ rowNum, fields, parent, errors });
  }

  return resolved;
}

export async function importEquipment(
  dataRows: string[][],
  header: string[],
  profile: UserProfile,
  requestId: string,
  commit: boolean,
): Promise<ImportReport> {
  if (dataRows.length === 0) throw new AppError('VALIDATION_ERROR', { fields: { file: 'No data rows found.' } });
  if (dataRows.length > MAX_ROWS) {
    throw new AppError('VALIDATION_ERROR', { fields: { file: `A single import is limited to ${MAX_ROWS} rows.` } });
  }

  const defs = await getFieldDefinitions(true);
  const resolved = await resolveRows(dataRows, header, defs);
  const anyErrors = resolved.some((r) => r.errors.length > 0);

  // Same field-level permission rule as the manual create form: a field
  // this account can't edit can't be set in bulk either. Note: `fields`
  // here are already keyed by field_key (types/level/status), matching
  // what assertFields/getEditableFieldKeys expect.
  const touched = new Set<string>();
  for (const r of resolved) {
    for (const [key, value] of Object.entries(r.fields)) if (value !== null) touched.add(key);
  }
  const editable = isAdmin(profile) ? [] : await getEditableFieldKeys(profile.id);
  assertFields(profile, Array.from(touched), editable);

  const actorId = profile.id;

  if (!commit || anyErrors) {
    return {
      total: resolved.length,
      valid: resolved.filter((r) => r.errors.length === 0).length,
      invalid: resolved.filter((r) => r.errors.length > 0).length,
      committed: false,
      rows: resolved.map((r) => ({
        row: r.rowNum,
        status: r.errors.length === 0 ? 'created' : 'error',
        serial_number: r.fields.serial_number ?? undefined,
        errors: r.errors.length ? r.errors : undefined,
      })),
    };
  }

  // Second pass: every row already validated clean — actually create them.
  const createdByKey = new Map<string, string>();
  const rows: ImportRowResult[] = [];
  for (const r of resolved) {
    const parentId = r.parent
      ? (r.parent.type === 'db' ? r.parent.id : createdByKey.get(r.parent.key)!)
      : null;
    const created = await createEquipmentFromFields(r.fields, defs, parentId, actorId, requestId) as
      { id: string; serial_number: string };
    createdByKey.set(batchKey(r.fields.part_number, r.fields.serial_number!), created.id);
    const dup = await findDuplicates(r.fields.part_number, r.fields.serial_number);
    rows.push({
      row: r.rowNum, status: 'created', id: created.id, serial_number: created.serial_number,
      duplicate_warning: dup.length > 1,
    });
  }

  return { total: rows.length, valid: rows.length, invalid: 0, committed: true, rows };
}

export { COLUMNS };
