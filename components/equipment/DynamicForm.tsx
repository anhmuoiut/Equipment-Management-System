'use client';

/**
 * Form engine sinh từ field_definitions.
 *
 * Đây không phải "CRUD form": nó render input, áp validation, áp field
 * permission và xử lý input_type đặc biệt hoàn toàn từ metadata trong DB.
 * Admin đổi cấu hình field → form đổi theo, không cần deploy.
 *
 * Bốn quy tắc dễ làm sai:
 *  1. current_location_id ('location_ref') và Type/Level/Status ('type_ref'
 *     /'level_ref'/'status_ref') source their options from a master-data
 *     table (locations / equipmentTypes / equipmentLevels / equipmentStatuses),
 *     never from dropdown_options — that's reserved for custom dropdown fields.
 *  2. Field không có quyền sửa là READ-ONLY, không phải ẩn. Mọi user xem
 *     được mọi field is_visible.
 *  3. Required validate theo payload, không theo record — record cũ thiếu
 *     giá trị vẫn sửa được field khác.
 *  4. 'boolean' fields store 'true'/'false' as strings in FormValues (same
 *     all-string convention as everything else here), not real booleans.
 *
 * `viewOnly` renders plain label/value blocks instead of form controls — the
 * equipment detail modal's View mode should look like an inspector reading
 * a record, not a form with every input disabled. Its Edit mode, and every
 * other caller (Create Equipment), keep the original interactive rendering.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DropdownOption, FieldDefinition, LocationRef, MasterDataRef, StatusRef } from '@/lib/client/api';
import { fieldHelp, fieldLabel, optionLabelL, type EquipmentLanguage } from '@/lib/i18n/equipment';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

export type FormValues = Record<string, string>;

/** field_key (stable business identifier) → real `equipment` column, for the
 *  three ref fields whose column name differs from their field_key —
 *  mirrors lib/validators/equipment.ts's REF_FIELD_COLUMN on the server. */
const REF_COLUMN: Record<string, string> = { types: 'type_id', level: 'level_id', status: 'status_id' };

type Props = {
  fields: FieldDefinition[];
  values: FormValues;
  onChange: (next: FormValues) => void;
  /** null = admin, toàn quyền. Mảng = danh sách field_key được sửa. */
  editableFields: string[] | null;
  locations: LocationRef[];
  equipmentTypes?: MasterDataRef[];
  equipmentLevels?: MasterDataRef[];
  equipmentStatuses?: StatusRef[];
  /** Lỗi theo từng trường do server trả về (details.fields). */
  fieldErrors?: Record<string, string>;
  mode: 'create' | 'edit';
  /** Location là read-only khi thiết bị đang có Parent. */
  locationLockedReason?: string | null;
  disabled?: boolean;
  /** Display-only: plain label/value blocks, no inputs at all. */
  viewOnly?: boolean;
};

function canEdit(key: string, editableFields: string[] | null): boolean {
  return editableFields === null || editableFields.includes(key);
}

/** Option đã gỡ vẫn phải hiện nếu record đang giữ giá trị đó, nếu không user
 *  sẽ thấy ô trống và vô tình xoá dữ liệu khi lưu. */
function optionsFor(def: FieldDefinition, current: string): DropdownOption[] {
  const opts = (def.dropdown_options ?? []).filter((o) => o.is_active);
  if (current && !opts.some((o) => o.value === current)) {
    const gone = def.dropdown_options?.find((o) => o.value === current);
    return [{ value: current, label: gone?.label ?? current, is_active: false }, ...opts];
  }
  return opts;
}

/** Same idea as optionsFor, for a *_ref field sourced from a master-data list. */
function refOptionsFor(list: MasterDataRef[], current: string): { value: string; label: string; disabled?: boolean }[] {
  const active = list.filter((o) => o.is_active);
  const opts: { value: string; label: string; disabled?: boolean }[] = active.map((o) => ({ value: o.id, label: o.display_name }));
  if (current && !active.some((o) => o.id === current)) {
    const gone = list.find((o) => o.id === current);
    if (gone) opts.unshift({ value: gone.id, label: `${gone.display_name} (inactive)`, disabled: true });
  }
  return opts;
}

/** What a display-only block shows for a field's stored value. */
function displayValue(
  def: FieldDefinition, value: string, language: EquipmentLanguage,
  refLists: { types: MasterDataRef[]; levels: MasterDataRef[]; statuses: MasterDataRef[]; locations: LocationRef[] },
): string {
  if (!value.trim()) return '—';
  if (def.input_type === 'dropdown') return optionLabelL(def, value, language);
  if (def.input_type === 'boolean') return value === 'true' ? 'Yes' : 'No';
  if (def.input_type === 'type_ref') return refLists.types.find((o) => o.id === value)?.display_name ?? value;
  if (def.input_type === 'level_ref') return refLists.levels.find((o) => o.id === value)?.display_name ?? value;
  if (def.input_type === 'status_ref') return refLists.statuses.find((o) => o.id === value)?.display_name ?? value;
  if (def.input_type === 'location_ref') {
    const loc = refLists.locations.find((o) => o.id === value);
    return loc ? `${loc.code}${loc.name && loc.name !== loc.code ? ` · ${loc.name}` : ''}` : value;
  }
  return value;
}

export function DynamicForm({
  fields, values, onChange, editableFields, locations,
  equipmentTypes = [], equipmentLevels = [], equipmentStatuses = [],
  fieldErrors = {}, mode, locationLockedReason, disabled, viewOnly = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => fields.filter((f) => f.is_visible).sort((a, b) => a.display_order - b.display_order),
    [fields],
  );

  function set(key: string, value: string) {
    setTouched((tset) => new Set(tset).add(key));
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((def) => {
        const key = def.field_key;
        const value = values[key] ?? '';
        const isLocation = def.input_type === 'location_ref';
        const label = fieldLabel(def, language);
        const help = fieldHelp(def, language);
        const wide = def.input_type === 'textarea';

        if (viewOnly) {
          const identClass = ['serial_number', 'part_number', 'asset', 'jabil_id'].includes(key) ? 'ident' : '';
          return (
            <div key={key} className={wide ? 'sm:col-span-2' : ''}>
              <p className="field-display-label">{label}</p>
              <p className={`field-display-value ${identClass}`}>
                {displayValue(def, value, language, { types: equipmentTypes, levels: equipmentLevels, statuses: equipmentStatuses, locations })}
              </p>
            </div>
          );
        }

        const lockedByPermission = !canEdit(key, editableFields);
        const lockedByInheritance = isLocation && !!locationLockedReason;
        const readOnly = disabled || lockedByPermission || lockedByInheritance;

        // Required rỗng chỉ báo khi user đã chạm vào, hoặc khi tạo mới —
        // tránh bôi đỏ cả form ngay lúc mở ra sửa một record cũ.
        const emptyRequired =
          def.input_type !== 'boolean' && def.is_required && !value.trim() && (mode === 'create' || touched.has(key));
        const error = fieldErrors[key] ??
          (emptyRequired ? t('dynamicForm.isRequired', { label }) : null);

        const inputStyle = {
          borderColor: error ? 'var(--alert)' : 'var(--rule)',
          background: readOnly ? 'var(--surface)' : 'var(--panel)',
          color: readOnly ? 'var(--ink-2)' : 'var(--ink)',
        };
        const identClass =
          ['serial_number', 'part_number', 'asset', 'jabil_id'].includes(key) ? 'ident' : '';

        return (
          <div key={key} className={wide ? 'sm:col-span-2' : ''}>
            <label className="block text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
              {label}
              {def.is_required && def.input_type !== 'boolean' && <span style={{ color: 'var(--alert)' }}> *</span>}
            </label>

            {def.input_type === 'boolean' ? (
              <div className="mt-1.5">
                <label className="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={value === 'true'} disabled={readOnly}
                    onChange={(e) => set(key, e.target.checked ? 'true' : 'false')} />
                  {label}
                </label>
              </div>
            ) : isLocation ? (
              <SearchableSelect
                value={value} disabled={readOnly} clearable placeholder={t('dynamicForm.selectPlaceholder')}
                ariaLabel={label} onChange={(v) => set(key, v)}
                options={locations.map((l) => ({
                  value: l.id, label: `${l.code}${l.name && l.name !== l.code ? ` · ${l.name}` : ''}`,
                }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={inputStyle}
              />
            ) : def.input_type === 'type_ref' || def.input_type === 'level_ref' || def.input_type === 'status_ref' ? (
              <SearchableSelect
                value={value} disabled={readOnly} clearable={!def.is_required} placeholder={t('dynamicForm.selectPlaceholder')}
                ariaLabel={label} onChange={(v) => set(key, v)}
                options={refOptionsFor(
                  def.input_type === 'type_ref' ? equipmentTypes : def.input_type === 'level_ref' ? equipmentLevels : equipmentStatuses,
                  value,
                )}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={inputStyle}
              />
            ) : def.input_type === 'dropdown' ? (
              <SearchableSelect
                value={value} disabled={readOnly} clearable placeholder={t('dynamicForm.selectPlaceholder')}
                ariaLabel={label} onChange={(v) => set(key, v)}
                options={optionsFor(def, value).map((o) => ({
                  value: o.value, disabled: !o.is_active,
                  label: `${optionLabelL(def, o.value, language)}${!o.is_active ? t('dynamicForm.discontinued') : ''}`,
                }))}
                className="mt-1 w-full border px-2 py-1.5 text-[13px]" style={inputStyle}
              />
            ) : def.input_type === 'textarea' ? (
              <textarea
                value={value} readOnly={readOnly} rows={3}
                maxLength={def.max_length ?? undefined}
                placeholder={def.placeholder ?? undefined}
                onChange={(e) => set(key, e.target.value)}
                className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]"
                style={inputStyle}
              />
            ) : (
              <input
                type={def.input_type === 'number' ? 'number' : def.input_type === 'date' ? 'date' : 'text'}
                value={value} readOnly={readOnly}
                maxLength={def.max_length ?? undefined}
                placeholder={def.placeholder ?? undefined}
                onChange={(e) => set(key, e.target.value)}
                className={`mt-1 w-full border px-2 py-1.5 text-[13px] ${identClass}`}
                style={inputStyle}
              />
            )}

            {error ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--alert)' }}>{error}</p>
            ) : lockedByInheritance ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {locationLockedReason}
              </p>
            ) : lockedByPermission ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {t('dynamicForm.noPermissionField')}
              </p>
            ) : help ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>{help}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Chỉ gửi lên những field user thực sự đổi — PUT là single-row, không cascade. */
export function changedFields(
  original: FormValues, current: FormValues, editableFields: string[] | null,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(current)) {
    if (k === 'current_location_id' || k === 'parent_id') continue; // có endpoint riêng
    if (!canEdit(k, editableFields)) continue;
    if ((original[k] ?? '') === v) continue;
    out[k] = v.trim() === '' ? null : v;
  }
  return out;
}

/** Builds a form's initial values straight from an equipment row: system
 *  fields read their real column (ref fields translated field_key → column,
 *  e.g. 'types' → type_id), custom fields read `custom_fields[field_key]`. */
export function equipmentToFormValues(e: Record<string, unknown>, fields: FieldDefinition[]): FormValues {
  const v: FormValues = {};
  const custom = (e.custom_fields as Record<string, unknown> | null) ?? {};
  for (const f of fields) {
    if (f.field_key === 'parent_id') continue;
    let raw: unknown;
    if (!f.is_system) raw = custom[f.field_key];
    else raw = e[REF_COLUMN[f.field_key] ?? f.field_key];
    v[f.field_key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return v;
}

/**
 * A Status with requires_remark = true makes Remark mandatory immediately
 * in the UI (the database is still the final enforcement layer — this is
 * purely so the user sees the requirement before submitting, not after).
 * Returns a shallow-cloned fields array with Remark's is_required overridden
 * when the currently-selected Status (values['status'], a status_id) calls
 * for it; otherwise returns `fields` unchanged.
 */
export function withRequiredRemark(fields: FieldDefinition[], values: FormValues, statuses: StatusRef[]): FieldDefinition[] {
  const status = statuses.find((s) => s.id === values.status);
  if (!status?.requires_remark) return fields;
  return fields.map((f) => (f.field_key === 'remark' ? { ...f, is_required: true } : f));
}
