import 'server-only';

/**
 * Dashboard aggregation — every number here comes from a grouped count or a
 * small, indexed lookup, never from pulling the whole equipment table to
 * the frontend. Labels (status/type/location display names) are resolved
 * from the small master-data tables in memory rather than joined, since
 * aggregate + embed together isn't something PostgREST supports in one
 * request.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapRpcError } from '@/lib/errors';
import { getDueSoonDays, listCalibrationAlerts, type CalibrationAlertRow } from './calibration';

export type DashboardFilters = { typeId?: string; locationId?: string };

/**
 * Grouped COUNT, computed in JS from the matching rows' single grouping
 * column rather than PostgREST's `count()` aggregate in `select` — that
 * aggregate is gated behind a project-level PostgREST setting
 * (`db-aggregates-enabled`) that's off by default, so relying on it made
 * every dashboard number fail with PGRST123 ("Use of aggregate functions
 * is not allowed") on any Supabase project that hasn't explicitly enabled
 * it. Fetching one column per matching row and counting client-side has no
 * such dependency; the tables here are small enough (equipment counts, not
 * equipment rows) for this to be cheap.
 */
async function groupCount(
  table: string, column: string, whereArchivedNull: boolean, filters: DashboardFilters = {},
): Promise<{ key: string | null; count: number }[]> {
  const db = supabaseAdmin();
  let q = db.from(table).select(column);
  if (whereArchivedNull) q = q.is('archived_at', null);
  if (filters.typeId) q = q.eq('type_id', filters.typeId);
  if (filters.locationId) q = q.eq('current_location_id', filters.locationId);
  const { data, error } = await q;
  if (error) throw mapRpcError(error as never);
  const counts = new Map<string | null, number>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = (row[column] as string | null) ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

export async function getDashboardSummary(filters: DashboardFilters = {}) {
  const db = supabaseAdmin();

  const [
    { count: total },
    statusCounts,
    typeCounts,
    locationCounts,
    calibrationCounts,
    openRepairs,
    statuses,
    types,
    locations,
    dueSoonDays,
  ] = await Promise.all([
    (() => {
      let q = db.from('equipment').select('id', { count: 'exact', head: true }).is('archived_at', null);
      if (filters.typeId) q = q.eq('type_id', filters.typeId);
      if (filters.locationId) q = q.eq('current_location_id', filters.locationId);
      return q;
    })(),
    groupCount('equipment', 'status_id', true, filters),
    groupCount('equipment', 'type_id', true, filters),
    groupCount('equipment', 'current_location_id', true, filters),
    groupCount('equipment_calibration_status', 'calibration_status', true, filters),
    db.from('repair_records').select('id, equipment_id, repair_type').is('repair_end_date', null),
    db.from('equipment_statuses').select('id, code, display_name, display_order').order('display_order'),
    db.from('equipment_types').select('id, code, display_name, display_order').order('display_order'),
    db.from('locations').select('id, code, name, sort_order').order('sort_order'),
    getDueSoonDays(),
  ]);

  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));
  const typeById = new Map((types.data ?? []).map((t) => [t.id, t]));
  const locationById = new Map((locations.data ?? []).map((l) => [l.id, l]));

  const byStatus = statusCounts.map((r) => ({
    id: r.key, code: statusById.get(r.key ?? '')?.code ?? null,
    label: r.key ? statusById.get(r.key)?.display_name ?? 'Unknown' : 'Not set',
    count: r.count,
  })).sort((a, b) => b.count - a.count);

  const byType = typeCounts.map((r) => ({
    id: r.key, code: typeById.get(r.key ?? '')?.code ?? null,
    label: r.key ? typeById.get(r.key)?.display_name ?? 'Unknown' : 'Not set',
    count: r.count,
  })).sort((a, b) => b.count - a.count);

  const byLocation = locationCounts.map((r) => ({
    id: r.key,
    label: locationById.get(r.key ?? '')?.code ?? 'Unknown',
    count: r.count,
  })).sort((a, b) => b.count - a.count);

  const calByStatus: Record<string, number> = { NOT_REQUIRED: 0, NOT_CALIBRATED: 0, OVERDUE: 0, DUE_SOON: 0, VALID: 0 };
  for (const row of calibrationCounts) if (row.key) calByStatus[row.key] = row.count;

  const repairRows = openRepairs.data ?? [];
  const openRepairEquipmentIds = [...new Set(repairRows.map((r) => (r as { equipment_id: string }).equipment_id))];
  const internalOpen = repairRows.filter((r) => (r as { repair_type: string }).repair_type === 'internal').length;
  const vendorOpen = repairRows.filter((r) => (r as { repair_type: string }).repair_type === 'vendor').length;

  return {
    total: total ?? 0,
    by_status: byStatus,
    by_type: byType,
    by_location: byLocation,
    calibration: { ...calByStatus, due_soon_days: dueSoonDays },
    repair: { open: openRepairEquipmentIds.length, internal_open: internalOpen, vendor_open: vendorOpen },
  };
}

export type AttentionRow = CalibrationAlertRow;

/** Overdue first, then Not Calibrated, then Due Soon — the priority order
 *  the Dashboard's attention list is meant to read in. Reads the same
 *  `listCalibrationAlerts` the notification bell reads, so the two can
 *  never disagree about what's due. */
export async function getCalibrationAttention(limit = 15, filters: DashboardFilters = {}): Promise<AttentionRow[]> {
  const rows = await listCalibrationAlerts(filters);
  return rows.slice(0, limit);
}

export type OpenRepairRow = {
  equipment_id: string; serial_number: string; part_number: string | null;
  repair_type: 'internal' | 'vendor'; problem: string | null;
  repair_start_date: string | null; location_label: string | null;
};

export async function getOpenRepairs(limit = 15): Promise<OpenRepairRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('repair_records')
    .select('equipment_id, repair_type, problem, repair_start_date, equipment:equipment_id(serial_number, part_number, archived_at, current_location:locations!equipment_current_location_id_fkey(code))')
    .is('repair_end_date', null)
    .order('repair_start_date', { ascending: false, nullsFirst: false })
    .limit(limit * 2); // headroom — archived equipment (rare) is filtered client-side below
  if (error) throw mapRpcError(error);

  type EqEmbed = { serial_number: string; part_number: string | null; archived_at: string | null; current_location: { code: string } | { code: string }[] | null };
  return (data ?? [])
    .map((r) => {
      const row = r as { equipment_id: string; repair_type: 'internal' | 'vendor'; problem: string | null; repair_start_date: string | null; equipment: EqEmbed | EqEmbed[] | null };
      const eq = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
      const loc = eq ? (Array.isArray(eq.current_location) ? eq.current_location[0] : eq.current_location) : null;
      return eq && !eq.archived_at ? {
        equipment_id: row.equipment_id, serial_number: eq.serial_number, part_number: eq.part_number,
        repair_type: row.repair_type, problem: row.problem, repair_start_date: row.repair_start_date,
        location_label: loc?.code ?? null,
      } : null;
    })
    .filter((r): r is OpenRepairRow => r !== null)
    .slice(0, limit);
}

export type ActivityRow = {
  id: string; entity_type: string; action: string; created_at: string;
  actor_name: string | null; note: string | null;
};

/** A compact operational feed, not the full Audit Log — equipment structural
 *  actions plus repair/calibration creation, most recent first. */
export async function getRecentActivity(limit = 20): Promise<ActivityRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('audit_log')
    .select('id, entity_type, entity_id, action, changes, changed_by, created_at, note')
    .in('entity_type', ['equipment', 'repair', 'calibration'])
    .in('action', ['CREATE', 'MOVE', 'SWAP', 'DETACH', 'ARCHIVE', 'RESTORE', 'UPDATE', 'CHANGE_LOCATION'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw mapRpcError(error);
  const rows = data ?? [];

  const actorIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))] as string[];
  const equipmentEntityIds = [...new Set(rows.filter((r) => r.entity_type === 'equipment').map((r) => r.entity_id).filter(Boolean))] as string[];
  const [{ data: actors }, { data: eqRows }] = await Promise.all([
    actorIds.length > 0 ? db.from('user_profiles').select('id, full_name').in('id', actorIds) : Promise.resolve({ data: [] }),
    equipmentEntityIds.length > 0 ? db.from('equipment').select('id, serial_number, part_number').in('id', equipmentEntityIds) : Promise.resolve({ data: [] }),
  ]);
  const nameById = new Map((actors ?? []).map((a) => [(a as { id: string }).id, (a as { full_name: string }).full_name]));
  const eqById = new Map((eqRows ?? []).map((e) => [(e as { id: string }).id, e as { serial_number: string; part_number: string | null }]));

  return rows.map((r) => {
    const equipmentLabel = r.entity_type === 'equipment' && r.entity_id
      ? (() => { const eq = eqById.get(r.entity_id); return eq ? `${eq.part_number ?? '—'} | ${eq.serial_number}` : null; })()
      : null;
    return {
      id: r.id, entity_type: r.entity_type, action: r.action, created_at: r.created_at,
      actor_name: r.changed_by ? nameById.get(r.changed_by) ?? null : null,
      note: equipmentLabel ?? r.note,
    };
  });
}
