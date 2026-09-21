import 'server-only';

/**
 * Admin-managed master data — Equipment Types / Statuses / Levels. Same
 * shape and the same plain-insert/update pattern as `locations` in
 * admin.ts (no RPC needed: these are single-row writes with no cascade or
 * concurrency concern the way equipment structural changes have). Adding a
 * normal value is a UI action, never a deploy. Referenced rows are
 * deactivated (is_active = false), never hard-deleted, so historical
 * equipment stays understandable.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';

export type MasterDataKind = 'equipment_types' | 'equipment_statuses' | 'equipment_levels' | 'departments';
const AUDIT_ENTITY: Record<MasterDataKind, 'equipment_type' | 'equipment_status' | 'equipment_level' | 'department'> = {
  equipment_types: 'equipment_type',
  equipment_statuses: 'equipment_status',
  equipment_levels: 'equipment_level',
  departments: 'department',
};

async function audit(
  entityType: 'equipment_type' | 'equipment_status' | 'equipment_level' | 'department',
  entityId: string, action: string, changes: Record<string, unknown>, actor: string, reqId: string,
) {
  const { error } = await supabaseAdmin().from('audit_log').insert({
    entity_type: entityType, entity_id: entityId, action, changes, changed_by: actor, request_id: reqId,
  });
  if (error) throw mapRpcError(error);
}

export async function listMasterData(kind: MasterDataKind, onlyActive: boolean) {
  let q = supabaseAdmin().from(kind).select('*')
    .order('display_order', { ascending: true }).order('code', { ascending: true });
  if (onlyActive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw mapRpcError(error);
  return data ?? [];
}

export type MasterDataCreateInput = {
  code: string; display_name: string; description?: string | null;
  display_order?: number; requires_remark?: boolean;
};

export async function createMasterData(
  kind: MasterDataKind, input: MasterDataCreateInput, actor: string, reqId: string,
) {
  const row: Record<string, unknown> = {
    code: input.code.trim(),
    display_name: input.display_name.trim(),
    description: input.description ?? null,
    display_order: input.display_order ?? 0,
    created_by: actor, updated_by: actor,
  };
  if (kind === 'equipment_statuses') row.requires_remark = input.requires_remark ?? false;

  const { data, error } = await supabaseAdmin().from(kind).insert(row).select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new AppError('VALIDATION_ERROR', { fields: { code: 'This code is already in use.' } });
    throw mapRpcError(error);
  }
  await audit(AUDIT_ENTITY[kind], (data as { id: string }).id, 'CREATE',
    { code: { old: null, new: row.code }, display_name: { old: null, new: row.display_name } }, actor, reqId);
  return data;
}

export type MasterDataPatch = {
  display_name?: string; description?: string | null; display_order?: number;
  is_active?: boolean; requires_remark?: boolean;
};

export async function updateMasterData(
  kind: MasterDataKind, id: string, patch: MasterDataPatch, actor: string, reqId: string,
) {
  const db = supabaseAdmin();
  const { data: before, error: beforeErr } = await db.from(kind).select('*').eq('id', id).maybeSingle();
  if (beforeErr) throw mapRpcError(beforeErr);
  if (!before) throw new AppError('VALIDATION_ERROR', { id: 'không tồn tại' });

  const clean: Record<string, unknown> = { ...patch, updated_by: actor };
  if (kind !== 'equipment_statuses') delete clean.requires_remark;

  const { data, error } = await db.from(kind).update(clean).eq('id', id).select().maybeSingle();
  if (error) throw mapRpcError(error);

  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { old: (before as Record<string, unknown>)[k], new: v };
  }
  await audit(AUDIT_ENTITY[kind], id, 'UPDATE', changes, actor, reqId);
  return data;
}
