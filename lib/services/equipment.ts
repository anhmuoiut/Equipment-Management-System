import 'server-only';

/**
 * Equipment service — V2.
 *
 * Tầng duy nhất được phép chạm supabaseAdmin(). Route handler gọi xuống đây,
 * không bao giờ tự query.
 *
 * Mọi thao tác ghi đều đi qua RPC: supabase-js không có transaction phía client,
 * nên multi-row atomic bắt buộc phải là plpgsql.
 *
 * V2 shape: Type/Status/Level are master-data references (type_id/status_id/
 * level_id), embedded here the same way current_location already was.
 * Admin-created custom fields live in `custom_fields` jsonb — see
 * lib/validators/equipment.ts's splitFieldPayload for how a field_key ends
 * up on one side or the other.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';
import { splitFieldPayload, type FieldDefinition } from '@/lib/validators/equipment';

const EQUIPMENT_COLUMNS = `
  id, jabil_id, part_number, serial_number, asset,
  type_id, level_id, status_id, calibration_required, custom_fields,
  current_location_id, remark, parent_id, version, archived_at,
  created_at, updated_at,
  current_location:locations!equipment_current_location_id_fkey ( id, code, name, sort_order ),
  type:equipment_types!equipment_type_id_fkey ( id, code, display_name ),
  level:equipment_levels!equipment_level_id_fkey ( id, code, display_name ),
  status:equipment_statuses!equipment_status_id_fkey ( id, code, display_name, requires_remark ),
  parent:parent_id ( id, part_number, serial_number )
`;

export type SortColumn =
  | 'status' | 'jabil_id' | 'part_number' | 'serial_number' | 'asset'
  | 'types' | 'level' | 'current_location_id' | 'remark' | 'parent';

export type ListParams = {
  /** One smart search box: matches every text field (serial/part/Jabil ID/
   *  asset/remark) AND, by name rather than literal column value, Type/
   *  Status/Level/Location — so typing "Base" finds Base-type equipment
   *  without the user having to say where to look first. No per-field
   *  scope selector; this is the only search behavior. */
  search?: string;
  page: number;
  pageSize: number;
  showArchived: boolean;
  filters: Partial<Record<'status_id' | 'type_id' | 'level_id' | 'current_location_id', string>>;
  /** Equipment currently under an open repair record (no repair_end_date yet). */
  underRepair?: boolean;
  /** Derived calibration state from equipment_calibration_status. */
  calibrationStatus?: string;
  /** Clicking a column header — overrides the default sort while active. */
  sort?: { column: SortColumn; direction: 'asc' | 'desc' };
  /** Loại chính nó + toàn bộ subtree khỏi kết quả (parent picker). */
  parentPickerFor?: string;
};

/** Gọi RPC và map lỗi. Mọi RPC raise exception '<ERROR_CODE>'. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw mapRpcError(error);
  return data as T;
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function listEquipment(p: ListParams) {
  const db = supabaseAdmin();

  let excludeIds: string[] = [];
  if (p.parentPickerFor) {
    const { data, error } = await db.rpc('internal_subtree_ids', { p_root: p.parentPickerFor });
    if (error) throw mapRpcError(error);
    excludeIds = (data as string[]) ?? [];
  }

  let q = db.from('equipment').select(EQUIPMENT_COLUMNS, { count: 'exact' });

  if (p.parentPickerFor || !p.showArchived) {
    q = q.is('archived_at', null);
  } else {
    q = q.not('archived_at', 'is', null);
  }
  if (excludeIds.length > 0) q = q.not('id', 'in', `(${excludeIds.join(',')})`);

  for (const [k, v] of Object.entries(p.filters)) {
    if (v) q = q.eq(k, v);
  }

  if (p.underRepair) {
    const { data: openRepairs } = await db.from('repair_records')
      .select('equipment_id').is('repair_end_date', null);
    const ids = [...new Set((openRepairs ?? []).map((r) => (r as { equipment_id: string }).equipment_id))];
    q = ids.length > 0
      ? q.in('id', ids)
      : q.eq('id', '00000000-0000-0000-0000-000000000000');
  }

  if (p.calibrationStatus) {
    const { data: calRows } = await db.from('equipment_calibration_status')
      .select('equipment_id').eq('calibration_status', p.calibrationStatus);
    const ids = (calRows ?? []).map((r) => (r as { equipment_id: string }).equipment_id);
    q = ids.length > 0
      ? q.in('id', ids)
      : q.eq('id', '00000000-0000-0000-0000-000000000000');
  }

  if (p.search?.trim()) {
    // ILIKE '%term%' — chấp nhận sequential scan. Ở 2.000 record Postgres
    // quét toàn bảng dưới 5ms. Btree index KHÔNG phục vụ được leading-wildcard;
    // chúng tồn tại cho filter và join.
    const t = `%${p.search.trim()}%`;

    // Type/Status/Level/Location aren't real equipment columns — resolve
    // the matching master-data ids first (plain data, not a query builder:
    // a Supabase builder is thenable, so returning one from an `async`
    // helper would get silently auto-awaited into its resolved response
    // before this function ever saw it), then fold each into the same OR
    // as the plain text columns below. This is what makes the single
    // search box "smart": typing a Type's name (e.g. "Base") matches
    // equipment of that type exactly like typing part of a serial number
    // matches on serial number — one query, no field picker required.
    async function matchIds(
      table: 'locations' | 'equipment_types' | 'equipment_statuses' | 'equipment_levels',
      nameColumn: 'name' | 'display_name',
    ): Promise<string[]> {
      const { data } = await db.from(table).select('id').or(`code.ilike.${t},${nameColumn}.ilike.${t}`);
      return (data ?? []).map((r) => (r as { id: string }).id);
    }

    const [locationIds, typeIds, statusIds, levelIds] = await Promise.all([
      matchIds('locations', 'name'),
      matchIds('equipment_types', 'display_name'),
      matchIds('equipment_statuses', 'display_name'),
      matchIds('equipment_levels', 'display_name'),
    ]);

    const orParts = [
      `serial_number.ilike.${t}`, `part_number.ilike.${t}`, `jabil_id.ilike.${t}`,
      `asset.ilike.${t}`, `remark.ilike.${t}`,
    ];
    if (locationIds.length > 0) orParts.push(`current_location_id.in.(${locationIds.join(',')})`);
    if (typeIds.length > 0) orParts.push(`type_id.in.(${typeIds.join(',')})`);
    if (statusIds.length > 0) orParts.push(`status_id.in.(${statusIds.join(',')})`);
    if (levelIds.length > 0) orParts.push(`level_id.in.(${levelIds.join(',')})`);
    q = q.or(orParts.join(','));
  }

  if (p.sort) {
    const asc = p.sort.direction === 'asc';
    switch (p.sort.column) {
      case 'current_location_id':
        q = q.order('code', { referencedTable: 'current_location', ascending: asc });
        break;
      case 'types':
        q = q.order('display_name', { referencedTable: 'type', ascending: asc });
        break;
      case 'level':
        q = q.order('display_name', { referencedTable: 'level', ascending: asc });
        break;
      case 'status':
        q = q.order('display_name', { referencedTable: 'status', ascending: asc });
        break;
      case 'parent':
        q = q.order('serial_number', { referencedTable: 'parent', ascending: asc });
        break;
      case 'serial_number':
        q = q.order('serial_sort', { ascending: asc });
        break;
      default:
        q = q.order(p.sort.column, { ascending: asc });
    }
    q = q.order('id', { ascending: true });
  } else {
    // Default sort: locations.sort_order → code → serial_sort → id.
    q = q
      .order('sort_order', { referencedTable: 'locations', ascending: true })
      .order('serial_sort', { ascending: true })
      .order('id', { ascending: true });
  }

  const from = (p.page - 1) * p.pageSize;
  q = q.range(from, from + p.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw mapRpcError(error);

  const rows = data ?? [];
  const ids = rows.map((r) => (r as { id: string }).id);

  let childParents = new Set<string>();
  if (ids.length > 0) {
    const { data: kids } = await db
      .from('equipment')
      .select('parent_id')
      .in('parent_id', ids)
      .is('archived_at', null);
    childParents = new Set((kids ?? []).map((k) => (k as { parent_id: string }).parent_id));
  }

  return {
    rows: rows.map((r) => ({ ...r, has_children: childParents.has((r as { id: string }).id) })),
    total: count ?? 0,
  };
}

export async function getEquipment(id: string) {
  const { data, error } = await supabaseAdmin()
    .from('equipment')
    .select(EQUIPMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) throw new AppError('EQUIPMENT_NOT_FOUND');
  return data;
}

export async function getContext(id: string) {
  await getEquipment(id); // 404 sớm thay vì trả context rỗng
  const [anc, desc] = await Promise.all([
    rpc<unknown[]>('get_equipment_ancestors', { p_id: id }),
    rpc<unknown[]>('get_equipment_descendants', { p_id: id }),
  ]);
  return { ancestors: anc ?? [], descendants: desc ?? [] };
}

/**
 * parent_id and current_location_id are stored (and diffed) as raw uuids —
 * meaningful to the database, meaningless to a person reading the History
 * tab. type_id/level_id/status_id are the same story. This resolves every
 * uuid referenced in a batch of audit rows to the label a user actually
 * recognizes before the rows ever reach the client, so the UI never has to
 * know these fields are special.
 */
async function resolveHistoryLabels(
  rows: { changes: Record<string, { old: unknown; new: unknown }> }[],
): Promise<void> {
  const db = supabaseAdmin();
  const parentIds = new Set<string>();
  const locationIds = new Set<string>();
  const typeIds = new Set<string>();
  const levelIds = new Set<string>();
  const statusIds = new Set<string>();
  for (const row of rows) {
    const collect = (key: string, set: Set<string>) => {
      const diff = row.changes[key];
      for (const v of [diff?.old, diff?.new]) if (typeof v === 'string') set.add(v);
    };
    collect('parent_id', parentIds);
    collect('current_location_id', locationIds);
    collect('type_id', typeIds);
    collect('level_id', levelIds);
    collect('status_id', statusIds);
  }
  if (parentIds.size === 0 && locationIds.size === 0 && typeIds.size === 0
    && levelIds.size === 0 && statusIds.size === 0) return;

  const [{ data: parents }, { data: locations }, { data: types }, { data: levels }, { data: statuses }] =
    await Promise.all([
      parentIds.size > 0
        ? db.from('equipment').select('id, part_number, serial_number').in('id', [...parentIds])
        : Promise.resolve({ data: [] as { id: string; part_number: string | null; serial_number: string }[] }),
      locationIds.size > 0
        ? db.from('locations').select('id, code').in('id', [...locationIds])
        : Promise.resolve({ data: [] as { id: string; code: string }[] }),
      typeIds.size > 0
        ? db.from('equipment_types').select('id, display_name').in('id', [...typeIds])
        : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
      levelIds.size > 0
        ? db.from('equipment_levels').select('id, display_name').in('id', [...levelIds])
        : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
      statusIds.size > 0
        ? db.from('equipment_statuses').select('id, display_name').in('id', [...statusIds])
        : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    ]);

  const parentLabel = new Map(
    (parents ?? []).map((p) => [p.id, `${p.part_number ?? '—'} | ${p.serial_number}`]),
  );
  const locationLabel = new Map((locations ?? []).map((l) => [l.id, l.code]));
  const typeLabel = new Map((types ?? []).map((x) => [x.id, x.display_name]));
  const levelLabel = new Map((levels ?? []).map((x) => [x.id, x.display_name]));
  const statusLabel = new Map((statuses ?? []).map((x) => [x.id, x.display_name]));

  const resolveOne = (diff: { old: unknown; new: unknown } | undefined, map: Map<string, string>) => {
    if (!diff) return;
    if (typeof diff.old === 'string') diff.old = map.get(diff.old) ?? diff.old;
    if (typeof diff.new === 'string') diff.new = map.get(diff.new) ?? diff.new;
  };

  for (const row of rows) {
    resolveOne(row.changes.parent_id, parentLabel);
    resolveOne(row.changes.current_location_id, locationLabel);
    resolveOne(row.changes.type_id, typeLabel);
    resolveOne(row.changes.level_id, levelLabel);
    resolveOne(row.changes.status_id, statusLabel);
  }
}

/** Resolves audit_log.changed_by uuids to the actor's full_name for display. */
async function resolveActorNames(
  rows: { changed_by: string | null }[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const row of rows) if (row.changed_by) ids.add(row.changed_by);
  if (ids.size === 0) return new Map();

  const { data } = await supabaseAdmin()
    .from('user_profiles').select('id, full_name').in('id', [...ids]);
  return new Map((data ?? []).map((u) => [u.id, u.full_name]));
}

export async function getHistory(id: string, limit = 100) {
  const { data, error } = await supabaseAdmin()
    .from('audit_log')
    .select('id, action, changes, changed_by, created_at, note, source, request_id')
    .eq('entity_type', 'equipment')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw mapRpcError(error);
  const rows = data ?? [];
  const [, actorNames] = await Promise.all([
    resolveHistoryLabels(rows as unknown as { changes: Record<string, { old: unknown; new: unknown }> }[]),
    resolveActorNames(rows),
  ]);
  return rows.map((row) => ({
    ...row,
    actor_name: row.changed_by ? actorNames.get(row.changed_by) ?? null : null,
  }));
}

/** Hydrates field_definitions with each dropdown field's options from
 *  field_options (custom fields only — *_ref fields source options from
 *  their own master-data table instead, fetched separately). */
export async function getFieldDefinitions(includeHidden = false): Promise<FieldDefinition[]> {
  const db = supabaseAdmin();
  let q = db
    .from('field_definitions')
    .select('id, field_key, display_label, data_type, input_type, is_required, is_visible, display_order, max_length, help_text, placeholder, is_system')
    .order('display_order', { ascending: true });
  if (!includeHidden) q = q.eq('is_visible', true);

  const { data, error } = await q;
  if (error) throw mapRpcError(error);
  const defs = (data ?? []) as Omit<FieldDefinition, 'dropdown_options'>[];

  const dropdownDefIds = defs.filter((d) => d.input_type === 'dropdown').map((d) => d.id);
  let optionsByDef = new Map<string, FieldDefinition['dropdown_options']>();
  if (dropdownDefIds.length > 0) {
    const { data: opts, error: optErr } = await db
      .from('field_options')
      .select('field_definition_id, value, label, is_active')
      .in('field_definition_id', dropdownDefIds)
      .order('display_order', { ascending: true });
    if (optErr) throw mapRpcError(optErr);
    optionsByDef = new Map();
    for (const o of opts ?? []) {
      const row = o as { field_definition_id: string; value: string; label: string; is_active: boolean };
      const list = optionsByDef.get(row.field_definition_id) ?? [];
      list.push({ value: row.value, label: row.label, is_active: row.is_active });
      optionsByDef.set(row.field_definition_id, list);
    }
  }

  return defs.map((d) => ({ ...d, dropdown_options: optionsByDef.get(d.id) ?? (d.input_type === 'dropdown' ? [] : null) }));
}

/** field_permissions now key by field_definition_id — this joins back to
 *  field_key so every other caller (which all work in terms of field_key,
 *  the stable business identifier) is unaffected by that change. */
export async function getEditableFieldKeys(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from('field_permissions')
    .select('field_definitions!inner(field_key)')
    .eq('user_id', userId)
    .eq('can_edit', true);
  if (error) throw mapRpcError(error);
  return (data ?? []).map((r) => {
    const rel = (r as { field_definitions: { field_key: string } | { field_key: string }[] }).field_definitions;
    return Array.isArray(rel) ? rel[0]?.field_key : rel?.field_key;
  }).filter((k): k is string => !!k);
}

/** Currently-active ids for each *_ref field_key — a freshly-chosen value
 *  must come from this set (see validateFields' activeRefs parameter). */
export async function getActiveRefLookup(): Promise<Record<string, Set<string>>> {
  const db = supabaseAdmin();
  const [{ data: types }, { data: levels }, { data: statuses }, { data: locations }] = await Promise.all([
    db.from('equipment_types').select('id').eq('is_active', true),
    db.from('equipment_levels').select('id').eq('is_active', true),
    db.from('equipment_statuses').select('id').eq('is_active', true),
    db.from('locations').select('id').eq('is_active', true),
  ]);
  return {
    types: new Set((types ?? []).map((r) => (r as { id: string }).id)),
    level: new Set((levels ?? []).map((r) => (r as { id: string }).id)),
    status: new Set((statuses ?? []).map((r) => (r as { id: string }).id)),
    current_location_id: new Set((locations ?? []).map((r) => (r as { id: string }).id)),
  };
}

/** Cảnh báo duplicate, KHÔNG block. */
export async function findDuplicates(partNumber?: string | null, serialNumber?: string | null) {
  if (!partNumber || !serialNumber) return [];
  const { data } = await supabaseAdmin()
    .from('equipment')
    .select('id, serial_number, part_number')
    .eq('part_number', partNumber)
    .eq('serial_number', serialNumber)
    .is('archived_at', null)
    .limit(5);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// WRITE — tất cả qua RPC
// ---------------------------------------------------------------------------

const createEquipmentRpc = (data: Record<string, unknown>, actor: string, reqId: string) =>
  rpc('create_equipment_with_audit', {
    p_data: data, p_actor: actor, p_request_id: reqId, p_source: 'ui',
  });

const updateEquipmentRpc = (
  id: string, version: number, changes: Record<string, unknown>, actor: string, reqId: string,
) =>
  rpc('update_equipment_with_audit', {
    p_id: id, p_version: version, p_changes: changes, p_actor: actor, p_request_id: reqId,
  });

/** Splits a validated field payload into real columns + custom_fields (ref
 *  field_keys translated to their real column names) and creates the row. */
export async function createEquipmentFromFields(
  clean: Record<string, unknown>, defs: FieldDefinition[], parentId: string | null,
  actor: string, reqId: string,
) {
  const { system, custom } = splitFieldPayload(clean, defs);
  return createEquipmentRpc({ ...system, parent_id: parentId, custom_fields: custom }, actor, reqId);
}

/**
 * Same split, but custom_fields is a REPLACE, not a merge, at the RPC level
 * (update_equipment_with_audit sets the whole column from the payload) — so
 * when only some custom fields changed, this first merges them onto the
 * record's current custom_fields before sending, or none of the untouched
 * custom values would survive the update.
 */
export async function updateEquipmentFromFields(
  id: string, version: number, clean: Record<string, unknown>, defs: FieldDefinition[],
  actor: string, reqId: string,
) {
  const { system, custom } = splitFieldPayload(clean, defs);
  const payload: Record<string, unknown> = { ...system };
  if (Object.keys(custom).length > 0) {
    const current = await getEquipment(id);
    payload.custom_fields = { ...((current as { custom_fields: Record<string, unknown> }).custom_fields ?? {}), ...custom };
  }
  return updateEquipmentRpc(id, version, payload, actor, reqId);
}

export const changeLocation = (
  id: string, locationId: string, version: number, actor: string, reqId: string,
) =>
  rpc('change_location_equipment', {
    p_id: id, p_new_location_id: locationId, p_version: version,
    p_actor: actor, p_request_id: reqId,
  });

export const moveEquipment = (
  id: string, newParentId: string, version: number, actor: string, reqId: string,
) =>
  rpc('move_equipment', {
    p_id: id, p_new_parent_id: newParentId, p_version: version,
    p_actor: actor, p_request_id: reqId,
  });

export const detachEquipment = (id: string, version: number, actor: string, reqId: string) =>
  rpc('detach_equipment', { p_id: id, p_version: version, p_actor: actor, p_request_id: reqId });

export const swapEquipment = (
  a: string, b: string, va: number, vb: number, actor: string, reqId: string, note?: string | null,
) =>
  rpc('swap_equipment', {
    p_a: a, p_b: b, p_version_a: va, p_version_b: vb, p_actor: actor, p_request_id: reqId,
    p_note: note ?? null,
  });

export const archiveEquipment = (id: string, version: number, actor: string, reqId: string) =>
  rpc('archive_equipment', { p_id: id, p_version: version, p_actor: actor, p_request_id: reqId });

export const restoreEquipment = (id: string, version: number, actor: string, reqId: string) =>
  rpc('restore_equipment', { p_id: id, p_version: version, p_actor: actor, p_request_id: reqId });
