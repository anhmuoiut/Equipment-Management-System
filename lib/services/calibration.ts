import 'server-only';

/**
 * Module Calibration — bảng calibration_equipments, calibration_histories.
 * Phụ thuộc một chiều vào Equipment (đọc thông tin thiết bị); Equipment không
 * đọc bảng này. due_date do database tự tính (04_functions.sql).
 */
import { appWrite, db, selectAll, selectOne } from './core/db';
import { readHistory } from './core/history';
import { assertActive, assertStatus, auditOf, loadLookups, nameOf, statusColorOf, type Lookups } from './core/lookups';
import { AppError, mapRpcError } from '@/lib/errors';
import type { CalibrationCandidate, CalibrationRow, DueState, HistoryEntry } from '@/lib/types';

type DbCalibration = {
  id: string; equipment_id: string; status_id: string | null; vendor_id: string | null;
  calibration_date: string | null; due_date: string | null; remark: string | null;
  created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
};
type DbEquipmentRef = {
  id: string; serial_number: string; part_number_id: string | null; type_id: string | null; location_id: string;
};
type DbInterval = { part_number_id: string; interval_months: number; warning_days: number };

export type CalibrationInput = {
  status_id?: string | null; vendor_id?: string | null; calibration_date?: string | null; remark?: string | null;
};

/** Hôm nay theo giờ Việt Nam (yyyy-mm-dd). */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function dueState(dueDate: string | null, warningDays: number | null, hasInterval: boolean): DueState {
  if (!hasInterval) return 'no_interval';
  if (!dueDate) return 'none';
  const now = today();
  if (dueDate < now) return 'overdue';
  const days = (Date.parse(dueDate) - Date.parse(now)) / 86_400_000;
  return days <= (warningDays ?? 30) ? 'due_soon' : 'ok';
}

function toRow(c: DbCalibration, e: DbEquipmentRef | undefined, intervals: Map<string, DbInterval>, lookups: Lookups): CalibrationRow {
  const interval = e?.part_number_id ? intervals.get(e.part_number_id) : undefined;
  return {
    id: c.id,
    equipment_id: c.equipment_id,
    serial_number: e?.serial_number ?? '—',
    part_number: nameOf(lookups.part_numbers, e?.part_number_id),
    type: nameOf(lookups.types, e?.type_id),
    location: nameOf(lookups.locations, e?.location_id),
    status_id: c.status_id, status: nameOf(lookups.statuses, c.status_id), status_color: statusColorOf(lookups, c.status_id),
    vendor_id: c.vendor_id, vendor: nameOf(lookups.calibration_vendors, c.vendor_id),
    calibration_date: c.calibration_date,
    due_date: c.due_date,
    interval_months: interval?.interval_months ?? null,
    warning_days: interval?.warning_days ?? null,
    due_state: dueState(c.due_date, interval?.warning_days ?? null, !!interval),
    remark: c.remark,
    ...auditOf(lookups, c),
  };
}

async function context() {
  const [equipment, intervals, lookups] = await Promise.all([
    selectAll<DbEquipmentRef>('equipments', 'id, serial_number, part_number_id, type_id, location_id'),
    selectAll<DbInterval>('calibration_configurations', 'id, part_number_id, interval_months, warning_days'),
    loadLookups(),
  ]);
  return {
    equipment: new Map(equipment.map((e) => [e.id, e])),
    intervals: new Map(intervals.map((i) => [i.part_number_id, i])),
    lookups,
    equipmentList: equipment,
  };
}

export async function listCalibration(): Promise<CalibrationRow[]> {
  const [rows, ctx] = await Promise.all([selectAll<DbCalibration>('calibration_equipments'), context()]);
  return rows.map((r) => toRow(r, ctx.equipment.get(r.equipment_id), ctx.intervals, ctx.lookups));
}

export async function getCalibration(id: string): Promise<CalibrationRow> {
  const row = await selectOne<DbCalibration>('calibration_equipments', id);
  if (!row) throw new AppError('NOT_FOUND');
  const ctx = await context();
  return toRow(row, ctx.equipment.get(row.equipment_id), ctx.intervals, ctx.lookups);
}

/** Extension point cho chi tiết thiết bị: dòng hiệu chuẩn của một thiết bị (hoặc null). */
export async function getCalibrationByEquipment(equipmentId: string): Promise<CalibrationRow | null> {
  const { data, error } = await db().from('calibration_equipments').select('*').eq('equipment_id', equipmentId).maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) return null;
  const ctx = await context();
  return toRow(data as DbCalibration, ctx.equipment.get(equipmentId), ctx.intervals, ctx.lookups);
}

/** Thiết bị có thể đưa vào Dashboard: chưa có trên Dashboard và part number có chu kỳ. */
export async function listCandidates(): Promise<CalibrationCandidate[]> {
  const [existing, ctx] = await Promise.all([
    selectAll<{ equipment_id: string }>('calibration_equipments', 'id, equipment_id'),
    context(),
  ]);
  const taken = new Set(existing.map((r) => r.equipment_id));
  return ctx.equipmentList
    .filter((e) => !taken.has(e.id) && e.part_number_id && ctx.intervals.has(e.part_number_id))
    .map((e) => ({
      id: e.id, serial_number: e.serial_number,
      part_number: nameOf(ctx.lookups.part_numbers, e.part_number_id),
      type: nameOf(ctx.lookups.types, e.type_id),
      location: nameOf(ctx.lookups.locations, e.location_id),
      interval_months: ctx.intervals.get(e.part_number_id!)!.interval_months,
    }))
    .sort((a, b) => a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true }));
}

export async function addCalibration(equipmentId: string, actor: string): Promise<CalibrationRow> {
  const { data: existing, error } = await db().from('calibration_equipments').select('id').eq('equipment_id', equipmentId).maybeSingle();
  if (error) throw mapRpcError(error);
  if (existing) throw new AppError('ALREADY_IN_CALIBRATION');
  const equipment = await selectOne<DbEquipmentRef>('equipments', equipmentId, 'id');
  if (!equipment) throw new AppError('EQUIPMENT_NOT_FOUND');
  const created = await appWrite<DbCalibration>('calibration_equipments', 'insert', null, { equipment_id: equipmentId }, actor);
  return getCalibration(created.id);
}

function validate(input: CalibrationInput, lookups: Lookups, before: DbCalibration) {
  assertActive(lookups.calibration_vendors, input.vendor_id, 'vendor_id', before.vendor_id);
  const statusId = input.status_id !== undefined ? input.status_id : before.status_id;
  const remark = input.remark !== undefined ? input.remark : before.remark;
  if (statusId !== before.status_id || input.remark !== undefined) assertStatus(lookups, statusId, 'calibration', remark);
}

/** Sửa thông tin nhập sai (UPDATE) hoặc ghi nhận lần hiệu chuẩn mới (đổi ngày → CALIBRATE). */
export async function updateCalibration(id: string, input: CalibrationInput, actor: string): Promise<CalibrationRow> {
  const before = await selectOne<DbCalibration>('calibration_equipments', id);
  if (!before) throw new AppError('NOT_FOUND');
  validate(input, await loadLookups(), before);
  if (Object.keys(input).length) await appWrite('calibration_equipments', 'update', id, input, actor);
  return getCalibration(id);
}

/** Bỏ khỏi Dashboard — chỉ Admin. */
export async function removeCalibration(id: string, actor: string): Promise<void> {
  await appWrite('calibration_equipments', 'delete', id, null, actor);
}

export async function calibrationHistory(id: string, onlyCalibrations: boolean): Promise<HistoryEntry[]> {
  const row = await selectOne<{ equipment_id: string }>('calibration_equipments', id, 'equipment_id');
  if (!row) throw new AppError('NOT_FOUND');
  const filters = [{ column: 'equipment_id', value: row.equipment_id }];
  if (onlyCalibrations) filters.push({ column: 'action', value: 'CALIBRATE' });
  return readHistory('calibration_histories', filters);
}
