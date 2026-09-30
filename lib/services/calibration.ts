import 'server-only';

/**
 * Calibration — permanent history plus a derived, never-persisted current
 * state (see the `equipment_calibration_status` view in full_reset.sql).
 * `calibrated_by` is free text on purpose (often an external vendor/lab),
 * distinct from `created_by` (the app user who entered the record).
 *
 * No delete endpoint, deliberately: a wrong record is corrected via update
 * (normal users can't even do that — calibration.update is a separate
 * grant from calibration.create), not removed. A void/invalidate workflow
 * is a possible future addition, not built speculatively now.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';

export type CalibrationInput = {
  calibration_date: string;
  calibration_due_date: string;
  calibrated_by: string;
};

async function equipmentSnapshot(equipmentId: string): Promise<string> {
  const { data } = await supabaseAdmin().from('equipment')
    .select('serial_number, part_number').eq('id', equipmentId).maybeSingle();
  const row = data as { serial_number: string; part_number: string | null } | null;
  return row ? `equipment: ${row.part_number ?? '—'} | ${row.serial_number}` : 'equipment: —';
}

export async function getCalibrationStatus(equipmentId: string) {
  const { data, error } = await supabaseAdmin()
    .from('equipment_calibration_status').select('*').eq('equipment_id', equipmentId).maybeSingle();
  if (error) throw mapRpcError(error);
  return data;
}

export async function listCalibrationRecords(equipmentId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('calibration_records')
    .select('*').eq('equipment_id', equipmentId).order('calibration_date', { ascending: false });
  if (error) throw mapRpcError(error);
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => (r as { created_by: string | null }).created_by).filter(Boolean))] as string[];
  const names = actorIds.length > 0
    ? await db.from('user_profiles').select('id, full_name').in('id', actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((names.data ?? []).map((u) => [u.id, u.full_name]));
  return rows.map((r) => ({ ...r, created_by_name: (r as { created_by: string | null }).created_by ? nameById.get((r as { created_by: string }).created_by) ?? null : null }));
}

export async function createCalibrationRecord(
  equipmentId: string, input: CalibrationInput, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: eq, error: eqErr } = await db.from('equipment')
    .select('id, archived_at, calibration_required').eq('id', equipmentId).maybeSingle();
  if (eqErr) throw mapRpcError(eqErr);
  if (!eq) throw new AppError('EQUIPMENT_NOT_FOUND');
  if ((eq as { archived_at: string | null }).archived_at) throw new AppError('EQUIPMENT_ARCHIVED');

  if (input.calibration_due_date < input.calibration_date) {
    throw new AppError('VALIDATION_ERROR', { fields: { calibration_due_date: 'Must be on or after the calibration date.' } });
  }

  const { data, error } = await db.from('calibration_records').insert({
    equipment_id: equipmentId,
    calibration_date: input.calibration_date,
    calibration_due_date: input.calibration_due_date,
    calibrated_by: input.calibrated_by,
    created_by: actor,
  }).select().maybeSingle();
  if (error) throw mapRpcError(error);

  await db.from('audit_log').insert({
    entity_type: 'calibration', entity_id: (data as { id: string }).id, action: 'CREATE',
    changes: {
      calibration_date: { old: null, new: input.calibration_date },
      calibration_due_date: { old: null, new: input.calibration_due_date },
      calibrated_by: { old: null, new: input.calibrated_by },
    },
    changed_by: actor, request_id: reqId, note: await equipmentSnapshot(equipmentId),
  });
  return data;
}

export async function updateCalibrationRecord(
  calibrationId: string, patch: Partial<CalibrationInput>, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before, error: beforeErr } = await db.from('calibration_records')
    .select('*').eq('id', calibrationId).maybeSingle();
  if (beforeErr) throw mapRpcError(beforeErr);
  if (!before) throw new AppError('VALIDATION_ERROR', { calibration_id: 'không tồn tại' });

  const nextDate = patch.calibration_date ?? (before as { calibration_date: string }).calibration_date;
  const nextDue = patch.calibration_due_date ?? (before as { calibration_due_date: string }).calibration_due_date;
  if (nextDue < nextDate) {
    throw new AppError('VALIDATION_ERROR', { fields: { calibration_due_date: 'Must be on or after the calibration date.' } });
  }

  const { data, error } = await db.from('calibration_records')
    .update(patch).eq('id', calibrationId).select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await db.from('audit_log').insert({
    entity_type: 'calibration', entity_id: calibrationId, action: 'UPDATE', changes,
    changed_by: actor, request_id: reqId,
    note: await equipmentSnapshot((before as { equipment_id: string }).equipment_id),
  });
  return data;
}

export type CalibrationAlertRow = {
  equipment_id: string; serial_number: string; part_number: string | null;
  type_label: string | null; location_label: string | null;
  calibration_status: 'OVERDUE' | 'NOT_CALIBRATED' | 'DUE_SOON';
  calibration_due_date: string | null; last_calibrated_by: string | null;
};

const ALERT_PRIORITY: Record<string, number> = { OVERDUE: 0, NOT_CALIBRATED: 1, DUE_SOON: 2 };

/**
 * Every piece of equipment currently in an alert-worthy calibration state
 * (OVERDUE / NOT_CALIBRATED / DUE_SOON), most urgent first — Overdue, then
 * Not Calibrated, then Due Soon by due date. This is the one query the
 * Dashboard's attention list (`getCalibrationAttention`) and the
 * notification bell (`lib/services/notifications.ts`) both read, so the
 * two can never disagree about what's due: there is nowhere else the
 * OVERDUE/DUE_SOON/NOT_CALIBRATED distinction or the Due Soon window gets
 * recomputed.
 */
export async function listCalibrationAlerts(
  filters: { typeId?: string; locationId?: string } = {},
): Promise<CalibrationAlertRow[]> {
  const db = supabaseAdmin();
  let calQuery = db.from('equipment_calibration_status')
    .select('equipment_id, calibration_status, calibration_due_date, last_calibrated_by')
    .is('archived_at', null)
    .in('calibration_status', ['OVERDUE', 'NOT_CALIBRATED', 'DUE_SOON']);
  if (filters.typeId) calQuery = calQuery.eq('type_id', filters.typeId);
  if (filters.locationId) calQuery = calQuery.eq('current_location_id', filters.locationId);
  const { data: calRows, error } = await calQuery.order('calibration_due_date', { ascending: true, nullsFirst: true });
  if (error) throw mapRpcError(error);
  const rows = (calRows ?? []) as { equipment_id: string; calibration_status: string; calibration_due_date: string | null; last_calibrated_by: string | null }[];
  if (rows.length === 0) return [];

  rows.sort((a, b) => ALERT_PRIORITY[a.calibration_status]! - ALERT_PRIORITY[b.calibration_status]!);

  const ids = rows.map((r) => r.equipment_id);
  const { data: eqRows } = await db.from('equipment')
    .select('id, serial_number, part_number, type:equipment_types!equipment_type_id_fkey(display_name), current_location:locations!equipment_current_location_id_fkey(code)')
    .in('id', ids);
  const eqById = new Map((eqRows ?? []).map((e) => [(e as { id: string }).id, e as {
    serial_number: string; part_number: string | null;
    type: { display_name: string } | { display_name: string }[] | null;
    current_location: { code: string } | { code: string }[] | null;
  }]));

  return rows.map((r) => {
    const eq = eqById.get(r.equipment_id);
    const type = eq ? (Array.isArray(eq.type) ? eq.type[0] : eq.type) : null;
    const loc = eq ? (Array.isArray(eq.current_location) ? eq.current_location[0] : eq.current_location) : null;
    return {
      equipment_id: r.equipment_id,
      serial_number: eq?.serial_number ?? '—',
      part_number: eq?.part_number ?? null,
      type_label: type?.display_name ?? null,
      location_label: loc?.code ?? null,
      calibration_status: r.calibration_status as CalibrationAlertRow['calibration_status'],
      calibration_due_date: r.calibration_due_date,
      last_calibrated_by: r.last_calibrated_by,
    };
  });
}

/** The states a calibration-required, active piece of equipment can be in
 *  (NOT_REQUIRED equipment isn't on the Calibration page at all). */
export const CALIBRATION_LIST_STATUSES = ['OVERDUE', 'NOT_CALIBRATED', 'DUE_SOON', 'VALID'] as const;
export type CalibrationListStatus = typeof CALIBRATION_LIST_STATUSES[number];

export type CalibrationOverviewRow = {
  equipment_id: string; serial_number: string; part_number: string | null;
  jabil_id: string | null; asset: string | null;
  type_label: string | null; location_label: string | null;
  calibration_status: CalibrationListStatus;
  last_calibration_date: string | null; calibration_due_date: string | null; last_calibrated_by: string | null;
  /** Whole days from today to the due date, negative once overdue; null
   *  when never calibrated. "Today" is the UTC date — the calendar the
   *  view's current_date decides OVERDUE/DUE_SOON by — so the two agree. */
  days_until_due: number | null;
};

export type CalibrationOverviewCounts = Record<CalibrationListStatus | 'ALL', number>;

export type CalibrationOverviewQuery = {
  status?: CalibrationListStatus; search?: string; page: number; pageSize: number;
};

const URGENCY: Record<CalibrationListStatus, number> = { OVERDUE: 0, NOT_CALIBRATED: 1, DUE_SOON: 2, VALID: 3 };

/** Most urgent state first (the same order as listCalibrationAlerts);
 *  within a state the earliest due date — most overdue, or soonest due —
 *  then serial number in natural order. */
function byUrgency(a: CalibrationOverviewRow, b: CalibrationOverviewRow): number {
  return URGENCY[a.calibration_status] - URGENCY[b.calibration_status]
    || (a.calibration_due_date ?? '').localeCompare(b.calibration_due_date ?? '')
    || a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true });
}

/**
 * Search, count, filter, sort and page the whole calibration-required set.
 * Pure, so the page's rules are testable without a database. Counts follow
 * the search but not the status filter — each status button shows how many
 * rows pressing it would list.
 */
export function buildCalibrationOverview(rows: readonly CalibrationOverviewRow[], query: CalibrationOverviewQuery) {
  const term = query.search?.trim().toLowerCase() ?? '';
  const matching = rows.filter((r) => !term || [
    r.serial_number, r.part_number, r.jabil_id, r.asset, r.type_label, r.location_label, r.last_calibrated_by,
  ].some((value) => value?.toLowerCase().includes(term)));

  const counts: CalibrationOverviewCounts = { ALL: matching.length, OVERDUE: 0, NOT_CALIBRATED: 0, DUE_SOON: 0, VALID: 0 };
  for (const r of matching) counts[r.calibration_status] += 1;

  const listed = matching
    .filter((r) => !query.status || r.calibration_status === query.status)
    .sort(byUrgency);
  const from = (query.page - 1) * query.pageSize;
  return { rows: listed.slice(from, from + query.pageSize), total: listed.length, counts };
}

/** PostgREST caps the rows one request returns (Supabase: 1000 by default)
 *  without saying so. The overview counts and sorts the whole set, so read
 *  it request by request until the exact count is reached. */
const ROWS_PER_REQUEST = 1000;

async function selectAll<T>(
  request: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null; error: Parameters<typeof mapRpcError>[0]; count: number | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await request(rows.length, rows.length + ROWS_PER_REQUEST - 1);
    if (error) throw mapRpcError(error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length === 0 || rows.length >= (count ?? 0)) return rows;
  }
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

type StatusViewRow = {
  equipment_id: string; calibration_status: CalibrationListStatus | 'NOT_REQUIRED';
  last_calibration_date: string | null; calibration_due_date: string | null; last_calibrated_by: string | null;
};
type EquipmentIdentityRow = {
  id: string; serial_number: string; part_number: string | null; jabil_id: string | null; asset: string | null;
  type: { display_name: string } | { display_name: string }[] | null;
  current_location: { code: string } | { code: string }[] | null;
};

/**
 * The Calibration page's list: every active, calibration-required piece of
 * equipment with its derived state (the same equipment_calibration_status
 * view the Dashboard and notification bell read) plus the identity columns
 * the view doesn't carry. Two reads joined here rather than one embedded
 * query — the view has no foreign key to embed equipment through — and no
 * `in (…ids)` filter, which would grow the request URL with the list.
 */
export async function listCalibrationOverview(query: CalibrationOverviewQuery) {
  const db = supabaseAdmin();
  const [statuses, identities, dueSoonDays] = await Promise.all([
    selectAll<StatusViewRow>((from, to) => db.from('equipment_calibration_status')
      .select('equipment_id, calibration_status, last_calibration_date, calibration_due_date, last_calibrated_by', { count: 'exact' })
      .is('archived_at', null).eq('calibration_required', true)
      .order('equipment_id').range(from, to)),
    selectAll<EquipmentIdentityRow>((from, to) => db.from('equipment')
      .select('id, serial_number, part_number, jabil_id, asset, type:equipment_types!equipment_type_id_fkey(display_name), current_location:locations!equipment_current_location_id_fkey(code)', { count: 'exact' })
      .is('archived_at', null).eq('calibration_required', true)
      .order('id').range(from, to)),
    getDueSoonDays(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const identityById = new Map(identities.map((e) => [e.id, e]));
  const rows: CalibrationOverviewRow[] = [];
  for (const s of statuses) {
    const eq = identityById.get(s.equipment_id);
    // Absent when the record changed between the two reads (archived, or
    // calibration no longer required) — it's simply not listed this time.
    if (!eq || s.calibration_status === 'NOT_REQUIRED') continue;
    const type = Array.isArray(eq.type) ? eq.type[0] : eq.type;
    const location = Array.isArray(eq.current_location) ? eq.current_location[0] : eq.current_location;
    rows.push({
      equipment_id: eq.id, serial_number: eq.serial_number, part_number: eq.part_number,
      jabil_id: eq.jabil_id, asset: eq.asset,
      type_label: type?.display_name ?? null, location_label: location?.code ?? null,
      calibration_status: s.calibration_status,
      last_calibration_date: s.last_calibration_date,
      calibration_due_date: s.calibration_due_date,
      last_calibrated_by: s.last_calibrated_by,
      days_until_due: s.calibration_due_date ? daysBetween(today, s.calibration_due_date) : null,
    });
  }
  return { ...buildCalibrationOverview(rows, query), due_soon_days: dueSoonDays };
}

export async function getDueSoonDays(): Promise<number> {
  const { data } = await supabaseAdmin().from('app_settings').select('value').eq('key', 'calibration').maybeSingle();
  const value = (data as { value: { due_soon_days?: number } } | null)?.value;
  return typeof value?.due_soon_days === 'number' ? value.due_soon_days : 30;
}

export async function setDueSoonDays(days: number, actor: string, reqId: string) {
  const db = supabaseAdmin();
  const { error } = await db.from('app_settings')
    .upsert({ key: 'calibration', value: { due_soon_days: days }, updated_by: actor });
  if (error) throw mapRpcError(error);
  await db.from('audit_log').insert({
    entity_type: 'permission', entity_id: null, action: 'FIELD_CONFIG_UPDATE',
    changes: { due_soon_days: { old: null, new: days } }, changed_by: actor, request_id: reqId,
  });
}
