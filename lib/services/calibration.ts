import 'server-only';

/**
 * Module Calibration — bảng calibration_equipments, calibration_histories.
 * Phụ thuộc một chiều vào Equipment (đọc thông tin thiết bị); Equipment không
 * đọc bảng này. Dòng hiệu chuẩn do database tự thêm / bỏ theo Configuration ›
 * Hiệu chuẩn › Setup; due_date do database tự tính (04_functions.sql mục 4).
 */
import { appWrite, db, selectAll, selectOne } from './core/db';
import { readHistory } from './core/history';
import { assertActive, auditOf, loadLookups, nameOf, statusColorOf, type Lookups } from './core/lookups';
import { AppError, mapRpcError } from '@/lib/errors';
import type { CalibrationRow, DueState, HistoryEntry } from '@/lib/types';

type DbCalibration = {
  id: string; equipment_id: string; vendor_id: string | null;
  calibration_date: string | null; due_date: string | null; remark: string | null;
  created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
};
type DbEquipmentRef = {
  id: string; serial_number: string; part_number_id: string | null; type_id: string | null; location_id: string; status_id: string;
};
type DbInterval = { part_number_id: string; interval_months: number; warning_days: number };

export type CalibrationInput = {
  vendor_id?: string | null; calibration_date?: string | null; remark?: string | null;
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
    // Trạng thái là của thiết bị — một nguồn, không giữ bản sao ở Calibration.
    status_id: e?.status_id ?? null, status: nameOf(lookups.statuses, e?.status_id), status_color: statusColorOf(lookups, e?.status_id),
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

/** `lookups`: dữ liệu gốc đã (đang) tải ở chỗ gọi — dùng chung thay vì đọc lại. */
async function context(lookups: Lookups | Promise<Lookups> = loadLookups()) {
  const [equipment, intervals, resolved] = await Promise.all([
    selectAll<DbEquipmentRef>('equipments', 'id, serial_number, part_number_id, type_id, location_id, status_id'),
    selectAll<DbInterval>('calibration_configurations', 'id, part_number_id, interval_months, warning_days'),
    lookups,
  ]);
  return {
    equipment: new Map(equipment.map((e) => [e.id, e])),
    intervals: new Map(intervals.map((i) => [i.part_number_id, i])),
    lookups: resolved,
  };
}

export async function listCalibration(lookups?: Promise<Lookups>): Promise<CalibrationRow[]> {
  const [rows, ctx] = await Promise.all([selectAll<DbCalibration>('calibration_equipments'), context(lookups)]);
  return rows.map((r) => toRow(r, ctx.equipment.get(r.equipment_id), ctx.intervals, ctx.lookups));
}

export async function getCalibration(id: string): Promise<CalibrationRow> {
  const [row, ctx] = await Promise.all([selectOne<DbCalibration>('calibration_equipments', id), context()]);
  if (!row) throw new AppError('NOT_FOUND');
  return toRow(row, ctx.equipment.get(row.equipment_id), ctx.intervals, ctx.lookups);
}

/** Extension point cho chi tiết thiết bị: dòng hiệu chuẩn của thiết bị, null = PN không có trong Setup hiệu chuẩn. */
export async function getCalibrationByEquipment(equipmentId: string): Promise<CalibrationRow | null> {
  const [{ data, error }, ctx] = await Promise.all([
    db().from('calibration_equipments').select('*').eq('equipment_id', equipmentId).maybeSingle(),
    context(),
  ]);
  if (error) throw mapRpcError(error);
  return data ? toRow(data as DbCalibration, ctx.equipment.get(equipmentId), ctx.intervals, ctx.lookups) : null;
}

function validate(input: CalibrationInput, lookups: Lookups, before: DbCalibration) {
  assertActive(lookups.calibration_vendors, input.vendor_id, 'vendor_id', before.vendor_id);
}

/** Sửa thông tin nhập sai (UPDATE) hoặc ghi nhận lần hiệu chuẩn mới (đổi ngày → CALIBRATE). */
export async function updateCalibration(id: string, input: CalibrationInput, actor: string): Promise<CalibrationRow> {
  const [before, lookups] = await Promise.all([selectOne<DbCalibration>('calibration_equipments', id), loadLookups()]);
  if (!before) throw new AppError('NOT_FOUND');
  validate(input, lookups, before);
  if (Object.keys(input).length) await appWrite('calibration_equipments', 'update', id, input, actor);
  return getCalibration(id);
}

export async function calibrationHistory(id: string, onlyCalibrations: boolean): Promise<HistoryEntry[]> {
  const row = await selectOne<{ equipment_id: string }>('calibration_equipments', id, 'equipment_id');
  if (!row) throw new AppError('NOT_FOUND');
  const filters = [{ column: 'equipment_id', value: row.equipment_id }];
  if (onlyCalibrations) filters.push({ column: 'action', value: 'CALIBRATE' });
  return readHistory('calibration_histories', filters);
}
