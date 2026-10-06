import 'server-only';

/**
 * Dữ liệu gốc dùng chung (Configuration) + tên người dùng, đọc một lần mỗi
 * request để đổi id → chữ hiển thị cho danh sách và chi tiết.
 */
import { selectAll } from './db';
import { AppError } from '@/lib/errors';
import type { OptionItem, Options, PartNumberOption, StatusColor, StatusOption } from '@/lib/types';

type Named = { id: string; display_name: string; sort_order: number; is_active: boolean };
/** `type_id`: Type của mọi thiết bị mang part number này. */
type PartNumber = Named & { type_id: string };

export type Lookups = {
  part_numbers: Map<string, PartNumber>;
  locations: Map<string, Named>;
  types: Map<string, Named>;
  levels: Map<string, Named>;
  departments: Map<string, Named>;
  calibration_vendors: Map<string, Named>;
  statuses: Map<string, StatusOption>;
  users: Map<string, string>;
};

const byOrder = <T extends { sort_order: number; display_name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name, undefined, { numeric: true });

const toMap = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
const BASIC = 'id, display_name, sort_order, is_active';

export async function loadLookups(): Promise<Lookups> {
  const [part_numbers, locations, types, levels, departments, calibration_vendors, statuses, users] = await Promise.all([
    selectAll<PartNumber>('part_numbers', `${BASIC}, type_id`),
    selectAll<Named>('locations', BASIC),
    selectAll<Named>('types', BASIC),
    selectAll<Named>('levels', BASIC),
    selectAll<Named>('departments', BASIC),
    selectAll<Named>('calibration_vendors', BASIC),
    selectAll<StatusOption>('statuses', 'id, display_name, sort_order, requires_remark, color'),
    selectAll<{ id: string; full_name: string }>('user_profiles', 'id, full_name'),
  ]);
  return {
    part_numbers: toMap(part_numbers), locations: toMap(locations), types: toMap(types), levels: toMap(levels),
    departments: toMap(departments), calibration_vendors: toMap(calibration_vendors), statuses: toMap(statuses),
    users: new Map(users.map((u) => [u.id, u.full_name])),
  };
}

export function nameOf(map: Map<string, { display_name: string }>, id: string | null | undefined): string | null {
  return id ? map.get(id)?.display_name ?? null : null;
}

/** Màu của trạng thái (statuses.color) — đi kèm tên trạng thái trên mọi dòng. */
export function statusColorOf(lookups: Lookups, id: string | null | undefined): StatusColor | null {
  return id ? lookups.statuses.get(id)?.color ?? null : null;
}

/** Type của part number (Configuration › Part Number) — thiết bị mang part number đó luôn có Type này. */
export function partNumberType(lookups: Lookups, partNumberId: string | null | undefined): string | null {
  return partNumberId ? lookups.part_numbers.get(partNumberId)?.type_id ?? null : null;
}

export function userName(lookups: Lookups, id: string | null | undefined): string | null {
  return id ? lookups.users.get(id) ?? null : null;
}

/** created_* / updated_* kèm tên người. */
export function auditOf(lookups: Lookups, row: {
  created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
}) {
  return {
    created_at: row.created_at, created_by: row.created_by, created_by_name: userName(lookups, row.created_by),
    updated_at: row.updated_at, updated_by: row.updated_by, updated_by_name: userName(lookups, row.updated_by),
  };
}

export function toOptions(lookups: Lookups): Options {
  const list = (map: Map<string, Named>): OptionItem[] => [...map.values()].sort(byOrder);
  return {
    part_numbers: [...lookups.part_numbers.values()].sort(byOrder) satisfies PartNumberOption[],
    locations: list(lookups.locations),
    types: list(lookups.types),
    levels: list(lookups.levels),
    departments: list(lookups.departments),
    calibration_vendors: list(lookups.calibration_vendors),
    statuses: [...lookups.statuses.values()].sort(byOrder),
  };
}

/**
 * Giá trị FK mới chọn phải còn đang dùng (is_active). Giữ nguyên giá trị cũ
 * đã ẩn thì được — chỉ chặn khi đổi sang một giá trị đã ẩn.
 */
export function assertActive(
  map: Map<string, Named>, id: string | null | undefined, field: string, previous?: string | null,
): void {
  if (!id || id === previous) return;
  const row = map.get(id);
  if (!row) throw new AppError('VALIDATION_ERROR', { fields: { [field]: 'not_found' } });
  if (!row.is_active) throw new AppError('INACTIVE_OPTION', { fields: { [field]: 'inactive' } });
}

/** Thiết bị / golden sample luôn có trạng thái (một danh sách chung); remark bắt buộc khi trạng thái yêu cầu. */
export function assertStatus(lookups: Lookups, statusId: string | null | undefined, remark: string | null | undefined): void {
  if (!statusId) throw new AppError('VALIDATION_ERROR', { fields: { status_id: 'required' } });
  const status = lookups.statuses.get(statusId);
  if (!status) throw new AppError('VALIDATION_ERROR', { fields: { status_id: 'not_found' } });
  if (status.requires_remark && !remark?.trim()) {
    throw new AppError('REMARK_REQUIRED_FOR_STATUS', { fields: { remark: 'required' } });
  }
}
