/**
 * Validation — V2.
 *
 * Required được validate THEO PAYLOAD, không theo record:
 *   Create → mọi field is_required phải có giá trị
 *   Update → chỉ reject nếu field is_required CÓ MẶT trong payload mà rỗng
 * Nhờ vậy record cũ thiếu giá trị vẫn edit được field khác bình thường.
 *
 * V2 field system: every field_definitions row is either a system field
 * (is_system = true, a real `equipment` column) or an admin-created custom
 * field (stored inside `equipment.custom_fields` jsonb). Four system fields
 * — Type / Level / Status / Current Location — are *_ref fields: their
 * value is a uuid pointing at a master-data table, not free text. Their
 * field_key stays a stable, human name ('types', 'level', 'status') even
 * though the real column is 'type_id' / 'level_id' / 'status_id' — see
 * REF_FIELD_COLUMN. Custom dropdown fields keep the field_key = stored
 * value convention, sourced from field_options instead of a json column.
 */
import { z } from 'zod';
import { AppError } from '@/lib/errors';

export type DropdownOption = { value: string; label: string; is_active: boolean };

export type InputType =
  | 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'dropdown'
  | 'location_ref' | 'type_ref' | 'status_ref' | 'level_ref';

export type FieldDefinition = {
  id: string;
  field_key: string;
  display_label: string;
  data_type: 'text' | 'number' | 'date' | 'boolean';
  input_type: InputType;
  is_required: boolean;
  /** Only populated for custom dropdown fields (joined from field_options). */
  dropdown_options: DropdownOption[] | null;
  is_visible: boolean;
  display_order: number;
  max_length: number | null;
  help_text: string | null;
  placeholder: string | null;
  is_system: boolean;
};

/** field_key (stable business identifier) → real `equipment` column, for the
 *  three ref fields whose column name differs from their field_key. Every
 *  other field_key equals its column name (system) or lives in custom_fields. */
export const REF_FIELD_COLUMN: Record<string, string> = {
  types: 'type_id',
  level: 'level_id',
  status: 'status_id',
};

export const REF_INPUT_TYPES: readonly InputType[] = ['type_ref', 'status_ref', 'level_ref', 'location_ref'];

/** Field chỉ đổi qua endpoint riêng, không bao giờ qua PUT. */
export const PUT_FORBIDDEN_FIELDS = ['current_location_id', 'parent_id'] as const;

export const uuid = z.string().uuid();

export const versionSchema = z.number().int().nonnegative();

export const putSchema = z.object({
  version: versionSchema,
  fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const createSchema = z.object({
  fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const moveSchema = z.object({ version: versionSchema, new_parent_id: uuid });
export const changeLocationSchema = z.object({ version: versionSchema, new_location_id: uuid });
export const versionOnlySchema = z.object({ version: versionSchema });
export const swapSchema = z.object({
  equipment_a_id: uuid,
  equipment_b_id: uuid,
  version_a: versionSchema,
  version_b: versionSchema,
  /** Optional — recorded on both sides' audit entries (swap feature spec §4.2, §6). */
  note: z.string().trim().max(500).nullish(),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError('VALIDATION_ERROR', { issues: r.error.issues.slice(0, 10) });
  }
  return r.data;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Referenced master data (Type/Status/Level/Location) still active, keyed by field_key. */
export type ActiveRefLookup = Record<string, Set<string>>;

/**
 * Validate payload theo field_definitions.
 * mode 'create' → required áp dụng cho TẤT CẢ field required
 * mode 'update' → required chỉ áp dụng cho field có mặt trong payload
 *
 * `activeRefs` (optional) maps a *_ref field_key to the set of currently
 * active master-data ids — a freshly-chosen value must be active; a record
 * already holding a since-deactivated one is untouched by this check
 * because it's simply not present in a payload that doesn't change it.
 */
export function validateFields(
  fields: Record<string, unknown>,
  defs: FieldDefinition[],
  mode: 'create' | 'update',
  activeRefs: ActiveRefLookup = {},
): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  const issues: Record<string, string> = {};
  const clean: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(fields)) {
    if (mode === 'update' && (PUT_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      issues[key] = 'Trường này chỉ đổi được qua thao tác riêng (Change Location / Move / Detach).';
      continue;
    }

    // parent_id is intentionally not a field_definitions row — the create
    // route reads it straight off `fields` as a sibling key.
    if (mode === 'create' && key === 'parent_id') continue;

    const def = byKey.get(key);
    if (!def) {
      issues[key] = 'Trường không tồn tại.';
      continue;
    }

    const value = typeof raw === 'boolean' ? raw : typeof raw === 'string' ? raw.trim() : raw;

    if (def.input_type === 'boolean') {
      // Unlike an HTML checkbox bound straight to a boolean, the raw input
      // here can genuinely be missing — an untouched field in FormValues
      // starts as '' (see CreateEquipmentModal's emptyValues), and an
      // imported spreadsheet cell can be blank. Both must stay
      // distinguishable from an explicit `false`/"false" answer, or a
      // required boolean field (e.g. Calibration Required) could never
      // actually fail validation — coercing straight to `false` here used
      // to make marking one required in Field configuration a no-op.
      if (isEmpty(value) && def.is_required) issues[key] = `${def.display_label} là bắt buộc.`;
      clean[key] = value === true || value === 'true';
      continue;
    }

    if (isEmpty(value)) {
      if (def.is_required) issues[key] = `${def.display_label} là bắt buộc.`;
      clean[key] = null;
      continue;
    }

    const str = String(value);

    if (def.max_length && str.length > def.max_length) {
      issues[key] = `${def.display_label} tối đa ${def.max_length} ký tự.`;
      continue;
    }

    if (def.input_type === 'number' && !Number.isFinite(Number(str))) {
      issues[key] = `${def.display_label} phải là số.`;
      continue;
    }

    if (def.input_type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(str)
      || !Number.isFinite(Date.parse(str)) || new Date(str).toISOString().slice(0, 10) !== str)) {
      issues[key] = `${def.display_label} phải là ngày hợp lệ (YYYY-MM-DD).`;
      continue;
    }

    if (def.input_type === 'dropdown') {
      const opts = def.dropdown_options ?? [];
      const match = opts.find((o) => o.value === str);
      if (!match) {
        issues[key] = `${def.display_label}: giá trị không hợp lệ.`;
        continue;
      }
      if (!match.is_active) {
        issues[key] = `${def.display_label}: lựa chọn này đã ngừng sử dụng.`;
        continue;
      }
    }

    if (REF_INPUT_TYPES.includes(def.input_type)) {
      if (!UUID_RE.test(str)) {
        issues[key] = `${def.display_label}: giá trị không hợp lệ.`;
        continue;
      }
      const active = activeRefs[key];
      if (active && !active.has(str)) {
        issues[key] = `${def.display_label}: lựa chọn này đã ngừng sử dụng.`;
        continue;
      }
    }

    clean[key] = str;
  }

  if (mode === 'create') {
    for (const def of defs) {
      if (!def.is_required || def.input_type === 'boolean') continue;
      if (def.field_key === 'current_location_id') continue; // xử lý riêng ở RPC
      if (isEmpty(clean[def.field_key])) {
        issues[def.field_key] = `${def.display_label} là bắt buộc.`;
      }
    }
  }

  if (Object.keys(issues).length > 0) {
    throw new AppError('VALIDATION_ERROR', { fields: issues });
  }
  return clean;
}

/** Splits a validated payload into real `equipment` columns (translating the
 *  three ref field_keys to their actual column names) and custom_fields
 *  entries (anything backed by a non-system field_definitions row). */
export function splitFieldPayload(
  clean: Record<string, unknown>,
  defs: FieldDefinition[],
): { system: Record<string, unknown>; custom: Record<string, unknown> } {
  const byKey = new Map(defs.map((d) => [d.field_key, d]));
  const system: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clean)) {
    const def = byKey.get(key);
    if (def && !def.is_system) {
      custom[key] = value;
      continue;
    }
    system[REF_FIELD_COLUMN[key] ?? key] = value;
  }
  return { system, custom };
}
