-- =============================================================================
-- apply_swap_feature.sql — adds the Swap compatibility rules + optional reason
-- =============================================================================
-- Safe to run on a live database with real data: this only replaces two
-- function definitions (create or replace), it does not touch any table or
-- row. Paste this whole file into Supabase SQL Editor and run once.
--
-- What changes:
--   - swap_equipment now rejects swapping two equipment of different Types
--     (Tester/Base/Fixture/Equipment). Part Number is not considered.
--   - Both swap_equipment and internal_move now accept an optional p_note,
--     recorded on the resulting audit_log entries (the swap dialog's
--     optional "Reason" field).
-- =============================================================================

create or replace function public.internal_move(
  p_id            uuid,
  p_new_parent_id uuid,
  p_version       integer,
  p_actor         uuid,
  p_request_id    text,
  p_action        text,
  p_note          text default null
) returns jsonb
language plpgsql as $$
declare
  v_ids        uuid[];
  v_node       public.equipment%rowtype;
  v_parent     public.equipment%rowtype;
  v_new_loc    uuid;
  v_old_parent uuid;
  v_old_loc    uuid;
  v_affected   int := 0;
begin
  select * into v_node from public.equipment where id = p_id;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_node.archived_at is not null then raise exception 'EQUIPMENT_ARCHIVED'; end if;

  v_old_parent := v_node.parent_id;
  v_old_loc    := v_node.current_location_id;

  v_ids := public.internal_subtree_ids(p_id);
  perform public.internal_lock_rows(v_ids);

  if p_new_parent_id is not null then
    if p_new_parent_id = any(v_ids) then
      raise exception 'PARENT_CYCLE_DETECTED';
    end if;
    select * into v_parent from public.equipment where id = p_new_parent_id;
    if not found then raise exception 'PARENT_NOT_FOUND'; end if;
    if v_parent.archived_at is not null then raise exception 'MOVE_TARGET_ARCHIVED'; end if;
    v_new_loc := v_parent.current_location_id;
  else
    v_new_loc := v_old_loc;
  end if;

  update public.equipment
     set parent_id           = p_new_parent_id,
         current_location_id = v_new_loc,
         version             = version + 1,
         updated_by          = p_actor
   where id = p_id
     and (p_version is null or version = p_version);
  if not found then raise exception 'OPTIMISTIC_CONFLICT'; end if;

  if v_new_loc is distinct from v_old_loc then
    v_affected := public.internal_cascade_location(
      v_ids, p_id, v_new_loc, p_actor, p_request_id, p_id);
  end if;

  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id, note)
  values ('equipment', p_id, p_action,
          jsonb_build_object(
            'parent_id', jsonb_build_object(
              'old', to_jsonb(v_old_parent), 'new', to_jsonb(p_new_parent_id)),
            'current_location_id', jsonb_build_object(
              'old', to_jsonb(v_old_loc), 'new', to_jsonb(v_new_loc))),
          p_actor, p_request_id, p_note);

  return jsonb_build_object(
    'equipment_id',         p_id,
    'old_parent_id',        v_old_parent,
    'new_parent_id',        p_new_parent_id,
    'old_location_id',      v_old_loc,
    'new_location_id',      v_new_loc,
    'affected_descendants', v_affected);
end;
$$;

create or replace function public.swap_equipment(
  p_a          uuid,
  p_b          uuid,
  p_version_a  integer,
  p_version_b  integer,
  p_actor      uuid,
  p_request_id text,
  p_note       text default null
) returns jsonb
language plpgsql as $$
declare
  v_a       public.equipment%rowtype;
  v_b       public.equipment%rowtype;
  v_ids_a   uuid[];
  v_ids_b   uuid[];
  v_pa      uuid;
  v_pb      uuid;
  v_res_a   jsonb;
  v_res_b   jsonb;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '8s', true);

  if p_a = p_b then raise exception 'SWAP_INVALID'; end if;

  v_ids_a := public.internal_subtree_ids(p_a);
  v_ids_b := public.internal_subtree_ids(p_b);

  perform public.internal_lock_rows(v_ids_a || v_ids_b);

  select * into v_a from public.equipment where id = p_a;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  select * into v_b from public.equipment where id = p_b;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;

  if v_a.archived_at is not null or v_b.archived_at is not null then
    raise exception 'EQUIPMENT_ARCHIVED';
  end if;

  -- Compatibility: only equipment of the same Type may be swapped — Part
  -- Number is not considered.
  if v_a.types is distinct from v_b.types then
    raise exception 'SWAP_INVALID';
  end if;

  if p_b = any(v_ids_a) or p_a = any(v_ids_b) then
    raise exception 'SWAP_INVALID_ANCESTOR_RELATION';
  end if;

  v_pa := v_a.parent_id;
  v_pb := v_b.parent_id;

  perform public.internal_lock_rows(array_remove(array[v_pa, v_pb], null));

  v_res_a := public.internal_move(p_a, v_pb, p_version_a, p_actor, p_request_id, 'SWAP', p_note);
  v_res_b := public.internal_move(p_b, v_pa, p_version_b, p_actor, p_request_id, 'SWAP', p_note);

  return jsonb_build_object('a', v_res_a, 'b', v_res_b);
end;
$$;
