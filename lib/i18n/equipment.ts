import type { FieldDefinition } from '@/lib/client/api';
import en from '@/src/i18n/locales/en.json';
import vi from '@/src/i18n/locales/vi.json';

export type EquipmentLanguage = 'en' | 'vi';
type Pair = readonly [english: string, vietnamese: string];

function buildPairs(enGroup: Record<string, string>, viGroup: Record<string, string>): Record<string, Pair> {
  const result: Record<string, Pair> = {};
  for (const key of Object.keys(enGroup)) {
    const en = enGroup[key] ?? '';
    result[key] = [en, viGroup[key] ?? en];
  }
  return result;
}

export const FIELD_LABELS: Record<string, Pair> = buildPairs(en.fields.labels, vi.fields.labels);
export const FIELD_HELP: Record<string, Pair> = buildPairs(en.fields.help, vi.fields.help);

function choose(pair: Pair, language: EquipmentLanguage): string {
  return language === 'vi' ? pair[1] : pair[0];
}

// Recognize shipped help text so defaults remain bilingual; admin edits take precedence.
const SEEDED_HELP: Record<string, string> = {
  serial_number: 'Số serial in trên thiết bị. Đây là mã người dùng dùng để tìm và chọn Parent.',
  part_number: 'Mã part của thiết bị.',
  jabil_id: 'Mã nội bộ Jabil, ví dụ P12316.',
  asset: 'Mã tài sản dùng cho kiểm kê.',
  current_location_id: 'Vị trí hiện tại. Nếu thiết bị có Parent thì ô này là read-only và tự động theo Parent — muốn đổi phải dùng Move, Swap hoặc Detach.',
  remark: 'Ghi chú tự do.',
};

export function fieldLabel(def: FieldDefinition, language: EquipmentLanguage): string {
  const pair = FIELD_LABELS[def.field_key];
  return pair?.includes(def.display_label) ? choose(pair, language) : def.display_label;
}

export function fieldHelp(def: FieldDefinition, language: EquipmentLanguage): string | null {
  const pair = FIELD_HELP[def.field_key];
  return pair && def.help_text && (pair.includes(def.help_text) || def.help_text === SEEDED_HELP[def.field_key])
    ? choose(pair, language) : def.help_text;
}

/** Custom dropdown fields only (Type/Status/Level are *_ref fields resolved
 *  from master data directly, not from field_definitions' dropdown_options). */
export function optionLabelL(
  def: FieldDefinition | undefined,
  value: string | null,
  _language: EquipmentLanguage,
): string {
  if (!value) return '—';
  if (!def || def.input_type !== 'dropdown') return value;
  const configured = def.dropdown_options?.find((option) => option.value === value);
  return configured?.label ?? value;
}
