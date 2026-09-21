import 'server-only';

/**
 * Repair history — a permanent lifecycle record distinct from the
 * structural Audit Log: it answers "what failed, who worked on it, what
 * did it cost", not "who changed which field to what value". Internal and
 * Vendor repair share one table (`repair_type` distinguishes them);
 * Location during a repair is just whatever `equipment.current_location_id`
 * already is (a vendor's site is a Location row like any other) — this
 * table never duplicates it.
 *
 * No delete endpoint: a repair record can be corrected via update, but
 * never removed, mirroring calibration_records' governance.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';

export type RepairInput = {
  repair_type: 'internal' | 'vendor';
  problem?: string | null;
  repair_start_date?: string | null;
  repair_end_date?: string | null;
  vendor_name?: string | null;
  repair_action?: string | null;
  repair_result?: string | null;
  quotation_ref?: string | null;
  repair_cost?: number | null;
  remark?: string | null;
};

async function equipmentSnapshot(equipmentId: string): Promise<string> {
  const { data } = await supabaseAdmin().from('equipment')
    .select('serial_number, part_number').eq('id', equipmentId).maybeSingle();
  const row = data as { serial_number: string; part_number: string | null } | null;
  return row ? `equipment: ${row.part_number ?? '—'} | ${row.serial_number}` : 'equipment: —';
}

export async function listRepairRecords(equipmentId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('repair_records')
    .select('*').eq('equipment_id', equipmentId).order('created_at', { ascending: false });
  if (error) throw mapRpcError(error);
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => (r as { created_by: string | null }).created_by).filter(Boolean))] as string[];
  const names = actorIds.length > 0
    ? await db.from('user_profiles').select('id, full_name').in('id', actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((names.data ?? []).map((u) => [u.id, u.full_name]));
  return rows.map((r) => ({ ...r, created_by_name: (r as { created_by: string | null }).created_by ? nameById.get((r as { created_by: string }).created_by) ?? null : null }));
}

export async function createRepairRecord(
  equipmentId: string, input: RepairInput, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: eq, error: eqErr } = await db.from('equipment').select('id, archived_at').eq('id', equipmentId).maybeSingle();
  if (eqErr) throw mapRpcError(eqErr);
  if (!eq) throw new AppError('EQUIPMENT_NOT_FOUND');
  if ((eq as { archived_at: string | null }).archived_at) throw new AppError('EQUIPMENT_ARCHIVED');

  const { data, error } = await db.from('repair_records').insert({
    equipment_id: equipmentId,
    repair_type: input.repair_type,
    problem: input.problem ?? null,
    repair_start_date: input.repair_start_date ?? null,
    repair_end_date: input.repair_end_date ?? null,
    vendor_name: input.vendor_name ?? null,
    repair_action: input.repair_action ?? null,
    repair_result: input.repair_result ?? null,
    quotation_ref: input.quotation_ref ?? null,
    repair_cost: input.repair_cost ?? null,
    remark: input.remark ?? null,
    created_by: actor, updated_by: actor,
  }).select().maybeSingle();
  if (error) throw mapRpcError(error);

  await db.from('audit_log').insert({
    entity_type: 'repair', entity_id: (data as { id: string }).id, action: 'CREATE',
    changes: { repair_type: { old: null, new: input.repair_type } },
    changed_by: actor, request_id: reqId, note: await equipmentSnapshot(equipmentId),
  });
  return data;
}

export async function updateRepairRecord(
  repairId: string, patch: Partial<RepairInput>, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before, error: beforeErr } = await db.from('repair_records').select('*').eq('id', repairId).maybeSingle();
  if (beforeErr) throw mapRpcError(beforeErr);
  if (!before) throw new AppError('VALIDATION_ERROR', { repair_id: 'không tồn tại' });

  const { data, error } = await db.from('repair_records')
    .update({ ...patch, updated_by: actor }).eq('id', repairId).select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await db.from('audit_log').insert({
    entity_type: 'repair', entity_id: repairId, action: 'UPDATE', changes,
    changed_by: actor, request_id: reqId,
    note: await equipmentSnapshot((before as { equipment_id: string }).equipment_id),
  });
  return data;
}
