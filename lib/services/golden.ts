import 'server-only';

/** Module Golden sample — bảng golden_samples, golden_sample_histories. */
import { appWrite, selectAll, selectOne } from './core/db';
import { readHistory } from './core/history';
import { assertActive, assertStatus, auditOf, loadLookups, nameOf, statusColorOf, type Lookups } from './core/lookups';
import { AppError } from '@/lib/errors';
import type { GoldenRow, HistoryEntry } from '@/lib/types';

type DbGolden = {
  id: string; part_number: string; serial_number: string; utd_part_number: string | null; location_id: string;
  status_id: string | null; origin: string | null; purpose: string | null; remark: string | null;
  created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
};

export type GoldenInput = Partial<Pick<DbGolden,
  'part_number' | 'serial_number' | 'utd_part_number' | 'location_id' | 'status_id' | 'origin' | 'purpose' | 'remark'>>;

function toRow(g: DbGolden, lookups: Lookups): GoldenRow {
  return {
    id: g.id, part_number: g.part_number, serial_number: g.serial_number, utd_part_number: g.utd_part_number,
    location_id: g.location_id, location: nameOf(lookups.locations, g.location_id),
    status_id: g.status_id, status: nameOf(lookups.statuses, g.status_id), status_color: statusColorOf(lookups, g.status_id),
    origin: g.origin, purpose: g.purpose, remark: g.remark,
    ...auditOf(lookups, g),
  };
}

export async function listGolden(): Promise<GoldenRow[]> {
  const [rows, lookups] = await Promise.all([selectAll<DbGolden>('golden_samples'), loadLookups()]);
  return rows.map((r) => toRow(r, lookups));
}

export async function getGolden(id: string): Promise<GoldenRow> {
  const row = await selectOne<DbGolden>('golden_samples', id);
  if (!row) throw new AppError('NOT_FOUND');
  return toRow(row, await loadLookups());
}

function validate(input: GoldenInput, lookups: Lookups, before?: DbGolden) {
  assertActive(lookups.locations, input.location_id, 'location_id', before?.location_id);
  const statusId = input.status_id !== undefined ? input.status_id : before?.status_id;
  const remark = input.remark !== undefined ? input.remark : before?.remark;
  if (statusId !== before?.status_id || input.remark !== undefined) assertStatus(lookups, statusId, 'golden_sample', remark);
}

async function duplicateSerial(serial: string, exceptId?: string): Promise<boolean> {
  const rows = await selectAll<{ id: string; serial_number: string }>('golden_samples', 'id, serial_number');
  const key = serial.trim().toLowerCase();
  return rows.some((r) => r.id !== exceptId && r.serial_number.trim().toLowerCase() === key);
}

export async function createGolden(input: GoldenInput, actor: string) {
  validate(input, await loadLookups());
  const duplicate = await duplicateSerial(input.serial_number ?? '');
  const created = await appWrite<DbGolden>('golden_samples', 'insert', null, input, actor);
  return { row: await getGolden(created.id), duplicate };
}

export async function updateGolden(id: string, input: GoldenInput, actor: string) {
  const before = await selectOne<DbGolden>('golden_samples', id);
  if (!before) throw new AppError('NOT_FOUND');
  validate(input, await loadLookups(), before);
  const duplicate = input.serial_number && input.serial_number !== before.serial_number
    ? await duplicateSerial(input.serial_number, id) : false;
  if (Object.keys(input).length) await appWrite('golden_samples', 'update', id, input, actor);
  return { row: await getGolden(id), duplicate };
}

export async function deleteGolden(id: string, actor: string): Promise<void> {
  await appWrite('golden_samples', 'delete', id, null, actor);
}

export function goldenHistory(id: string): Promise<HistoryEntry[]> {
  return readHistory('golden_sample_histories', [{ column: 'golden_sample_id', value: id }]);
}
