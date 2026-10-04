import 'server-only';

/**
 * Module Equipment — bảng equipments, equipment_histories.
 * Không đọc bảng của module khác (Calibration gắn vào chi tiết thiết bị qua
 * extension point phía UI). Lịch sử do database tự ghi.
 */
import { appWrite, rpc, selectAll, selectOne } from './core/db';
import { readHistory } from './core/history';
import { assertActive, assertStatus, auditOf, loadLookups, nameOf, statusColorOf, type Lookups } from './core/lookups';
import { AppError } from '@/lib/errors';
import type { ChildrenMode, EquipmentRow, EquipmentTreeNode, HistoryEntry } from '@/lib/types';

type DbEquipment = {
  id: string; jabil_id: string | null; part_number_id: string | null; serial_number: string; asset: string | null;
  type_id: string | null; status_id: string | null; level_id: string | null; location_id: string; remark: string | null;
  parent_id: string | null; created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
};

/**
 * Trường nhập của form thiết bị. `parent_id`: thiết bị cha (null = không có cha) — có cha thì vị trí theo cha.
 * `children_mode`: khi sửa đổi cha / vị trí của thiết bị có con — con đi theo hay ở lại chỗ cũ.
 */
export type EquipmentInput = {
  serial_number?: string; jabil_id?: string | null; part_number_id?: string | null; asset?: string | null;
  type_id?: string | null; status_id?: string | null; level_id?: string | null; location_id?: string | null; remark?: string | null;
  parent_id?: string | null; children_mode?: ChildrenMode;
};

function toRow(e: DbEquipment, lookups: Lookups, serials: Map<string, string>, parents: Set<string>): EquipmentRow {
  return {
    id: e.id,
    jabil_id: e.jabil_id,
    part_number_id: e.part_number_id, part_number: nameOf(lookups.part_numbers, e.part_number_id),
    serial_number: e.serial_number,
    asset: e.asset,
    type_id: e.type_id, type: nameOf(lookups.types, e.type_id),
    status_id: e.status_id, status: nameOf(lookups.statuses, e.status_id), status_color: statusColorOf(lookups, e.status_id),
    level_id: e.level_id, level: nameOf(lookups.levels, e.level_id),
    location_id: e.location_id, location: nameOf(lookups.locations, e.location_id),
    remark: e.remark,
    parent_id: e.parent_id, parent_serial: e.parent_id ? serials.get(e.parent_id) ?? null : null,
    has_children: parents.has(e.id),
    ...auditOf(lookups, e),
  };
}

async function loadAll() {
  const [rows, lookups] = await Promise.all([selectAll<DbEquipment>('equipments'), loadLookups()]);
  const serials = new Map(rows.map((r) => [r.id, r.serial_number]));
  const parents = new Set(rows.map((r) => r.parent_id).filter((v): v is string => !!v));
  return { rows, lookups, serials, parents };
}

export async function listEquipment(): Promise<EquipmentRow[]> {
  const { rows, lookups, serials, parents } = await loadAll();
  return rows.map((r) => toRow(r, lookups, serials, parents));
}

export async function getEquipment(id: string): Promise<EquipmentRow> {
  const [row, lookups, related] = await Promise.all([
    selectOne<DbEquipment>('equipments', id),
    loadLookups(),
    selectAll<{ id: string; parent_id: string | null; serial_number: string }>('equipments', 'id, parent_id, serial_number'),
  ]);
  if (!row) throw new AppError('EQUIPMENT_NOT_FOUND');
  const serials = new Map(related.map((r) => [r.id, r.serial_number]));
  const parents = new Set(related.map((r) => r.parent_id).filter((v): v is string => !!v));
  return toRow(row, lookups, serials, parents);
}

function validate(input: EquipmentInput, lookups: Lookups, before?: DbEquipment) {
  assertActive(lookups.part_numbers, input.part_number_id, 'part_number_id', before?.part_number_id);
  assertActive(lookups.types, input.type_id, 'type_id', before?.type_id);
  assertActive(lookups.levels, input.level_id, 'level_id', before?.level_id);
  assertActive(lookups.locations, input.location_id, 'location_id', before?.location_id);
  const statusId = input.status_id !== undefined ? input.status_id : before?.status_id;
  const remark = input.remark !== undefined ? input.remark : before?.remark;
  if (!before || statusId !== before.status_id || input.remark !== undefined) assertStatus(lookups, statusId, remark);
}

async function duplicateSerial(serial: string, exceptId?: string): Promise<boolean> {
  const rows = await selectAll<{ id: string; serial_number: string }>('equipments', 'id, serial_number');
  const key = serial.trim().toLowerCase();
  return rows.some((r) => r.id !== exceptId && r.serial_number.trim().toLowerCase() === key);
}

/** Thêm thiết bị. Có cha thì vị trí lấy theo cha (bỏ qua location_id gửi lên). */
export async function createEquipment(input: EquipmentInput, actor: string) {
  if (!input.serial_number) throw new AppError('VALIDATION_ERROR', { fields: { serial_number: 'required' } });
  const { parent_id: parentId, children_mode: _unused, ...fields } = input;
  let data: EquipmentInput = fields;
  const [lookups, parent] = await Promise.all([
    loadLookups(),
    parentId ? selectOne<DbEquipment>('equipments', parentId, 'id, location_id') : null,
  ]);
  if (parentId) {
    if (!parent) throw new AppError('PARENT_NOT_FOUND', { fields: { parent_id: 'not_found' } });
    validate({ ...fields, location_id: undefined }, lookups);
    data = { ...fields, location_id: parent.location_id, parent_id: parent.id };
  } else {
    if (!input.location_id) throw new AppError('VALIDATION_ERROR', { fields: { location_id: 'required' } });
    validate(fields, lookups);
  }
  const duplicate = await duplicateSerial(input.serial_number);
  const created = await appWrite<DbEquipment>('equipments', 'insert', null, data, actor);
  return { row: await getEquipment(created.id), duplicate };
}

/** Thiết bị cha mới phải tồn tại và không nằm trong cây con của thiết bị (tránh vòng lặp). */
async function assertParent(id: string, parentId: string) {
  const rows = await selectAll<{ id: string; parent_id: string | null }>('equipments', 'id, parent_id');
  if (!rows.some((r) => r.id === parentId)) throw new AppError('PARENT_NOT_FOUND', { fields: { parent_id: 'not_found' } });
  const children = new Map<string, string[]>();
  rows.forEach((r) => { if (r.parent_id) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r.id]); });
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === parentId) throw new AppError('PARENT_CYCLE_DETECTED', { fields: { parent_id: 'invalid' } });
    stack.push(...(children.get(current) ?? []));
  }
}

/**
 * Sửa thông tin.
 * - Thiết bị cha: đổi cha → vị trí theo cha mới, cả cây con đi theo (lịch sử MOVE);
 *   bỏ trống → tách khỏi cha, giữ vị trí hiện tại (DETACH) rồi mới áp vị trí mới nếu có.
 * - Vị trí: có cha thì theo cha; không có cha đổi vị trí thì cả cây con đổi theo.
 * Kiểm tra hết (giá trị chọn, vòng lặp) trước khi ghi.
 */
export async function updateEquipment(id: string, input: EquipmentInput, actor: string) {
  const [before, lookups] = await Promise.all([selectOne<DbEquipment>('equipments', id), loadLookups()]);
  if (!before) throw new AppError('EQUIPMENT_NOT_FOUND');

  const { location_id, parent_id: parentInput, children_mode: children = 'follow', ...fields } = input;
  const parentChanged = parentInput !== undefined && parentInput !== before.parent_id;
  const parentAfter = parentInput !== undefined ? parentInput : before.parent_id;
  const locationChanged = location_id !== undefined && location_id !== before.location_id;
  // Có cha (và không đổi cha) thì vị trí theo cha; đổi sang cha mới thì vị trí theo cha mới.
  if (locationChanged && parentAfter && !parentChanged) throw new AppError('LOCATION_INHERITED_READ_ONLY');
  const setLocation = locationChanged && !parentAfter;

  validate({ ...fields, location_id: setLocation ? location_id : undefined }, lookups, before);
  if (parentChanged && parentInput) await assertParent(id, parentInput);

  const duplicate = input.serial_number && input.serial_number !== before.serial_number
    ? await duplicateSerial(input.serial_number, id) : false;
  if (Object.keys(fields).length) await appWrite('equipments', 'update', id, fields, actor);
  if (parentChanged) {
    if (parentInput) await rpc('equipment_move', { p_id: id, p_parent_id: parentInput, p_actor: actor, p_children: children });
    else await rpc('equipment_detach', { p_id: id, p_actor: actor, p_children: children });
  }
  if (setLocation) {
    await rpc('equipment_change_location', { p_id: id, p_location_id: location_id, p_actor: actor, p_children: children });
  }
  return { row: await getEquipment(id), duplicate };
}

// Thao tác cây (database/04_functions.sql mục 3). `children`: thiết bị con đi theo
// (mặc định) hay ở lại chỗ cũ — gắn vào thiết bị đến thay (Swap) hoặc cha cũ.

export async function changeLocation(id: string, locationId: string, actor: string, children: ChildrenMode = 'follow') {
  assertActive((await loadLookups()).locations, locationId, 'location_id');
  await rpc('equipment_change_location', { p_id: id, p_location_id: locationId, p_actor: actor, p_children: children });
  return getEquipment(id);
}

export async function moveEquipment(id: string, parentId: string, actor: string, children: ChildrenMode = 'follow') {
  await rpc('equipment_move', { p_id: id, p_parent_id: parentId, p_actor: actor, p_children: children });
  return getEquipment(id);
}

export async function detachEquipment(id: string, actor: string, children: ChildrenMode = 'follow') {
  await rpc('equipment_detach', { p_id: id, p_actor: actor, p_children: children });
  return getEquipment(id);
}

export async function swapEquipment(a: string, b: string, actor: string, children: ChildrenMode = 'follow') {
  await rpc('equipment_swap', { p_a: a, p_b: b, p_actor: actor, p_children: children });
  return getEquipment(a);
}

/** Xóa thật. follow: cả cây con bị xóa theo; stay: chỉ xóa thiết bị này. Trả về số thiết bị đã xóa. */
export async function deleteEquipment(id: string, actor: string, children: ChildrenMode = 'follow'): Promise<number> {
  return rpc<number>('equipment_delete', { p_id: id, p_actor: actor, p_children: children });
}

/** Cả cây chứa thiết bị này (từ gốc). Mỗi nút chỉ PN + SN — docs/DETAIL_MODEL.md 4.1. */
export async function equipmentTree(id: string): Promise<{ root_id: string; nodes: EquipmentTreeNode[] }> {
  const [rows, lookups] = await Promise.all([
    selectAll<{ id: string; parent_id: string | null; part_number_id: string | null; serial_number: string }>(
      'equipments', 'id, parent_id, part_number_id, serial_number'),
    loadLookups(),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!byId.has(id)) throw new AppError('EQUIPMENT_NOT_FOUND');
  let rootId = id;
  for (let guard = 0; byId.get(rootId)?.parent_id && guard < 100; guard++) rootId = byId.get(rootId)!.parent_id!;

  const children = new Map<string, string[]>();
  rows.forEach((r) => { if (r.parent_id) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r.id]); });
  const nodes: EquipmentTreeNode[] = [];
  const stack = [rootId];
  while (stack.length && nodes.length < 5000) {
    const current = byId.get(stack.pop()!)!;
    nodes.push({
      id: current.id, parent_id: current.parent_id, serial_number: current.serial_number,
      part_number: nameOf(lookups.part_numbers, current.part_number_id),
    });
    stack.push(...(children.get(current.id) ?? []));
  }
  return { root_id: rootId, nodes };
}

/** Id các part number đang có thiết bị dùng (Configuration › Hiệu chuẩn › Setup chỉ chọn trong đó). */
export async function equipmentPartNumberIds(): Promise<string[]> {
  const rows = await selectAll<{ part_number_id: string | null }>('equipments', 'id, part_number_id');
  return [...new Set(rows.map((r) => r.part_number_id).filter((id): id is string => !!id))];
}

export function equipmentHistory(id: string): Promise<HistoryEntry[]> {
  return readHistory('equipment_histories', [{ column: 'equipment_id', value: id }]);
}
