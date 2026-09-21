-- =============================================================================
-- 007_audit_log_fixes.sql  —  don't log fields that didn't actually change
-- =============================================================================
-- Run once, after 001–006, in Supabase SQL Editor.
--
-- Bug: internal_move() (shared by MOVE / DETACH / SWAP) always wrote both
-- parent_id and current_location_id into audit_log.changes, even when one of
-- them hadn't changed. A Detach deliberately keeps the equipment's current
-- location (mục 22), so every "Detached from parent" History entry showed a
-- confusing "Current Location: <uuid> → <uuid>" line with the exact same
-- value on both sides — reads like the location moved when it didn't.
--
-- Fix: only include a key in the audit changes object when its value is
-- actually distinct from before, the same rule update_equipment_with_audit()
-- already followed. If nothing about a call actually changed the row, no
-- audit_log row is inserted at all, matching update_equipment_with_audit()'s
-- behavior too.
-- =============================================================================
begin;

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
  v_changes    jsonb := '{}'::jsonb;
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
    v_new_loc := v_old_loc;                                -- detach: giữ location (mục 22)
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

  if p_new_parent_id is distinct from v_old_parent then
    v_changes := v_changes || jsonb_build_object(
      'parent_id', jsonb_build_object('old', to_jsonb(v_old_parent), 'new', to_jsonb(p_new_parent_id)));
  end if;
  if v_new_loc is distinct from v_old_loc then
    v_changes := v_changes || jsonb_build_object(
      'current_location_id', jsonb_build_object('old', to_jsonb(v_old_loc), 'new', to_jsonb(v_new_loc)));
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.audit_log
          (entity_type, entity_id, action, changes, changed_by, request_id, note)
    values ('equipment', p_id, p_action, v_changes, p_actor, p_request_id, p_note);
  end if;

  return jsonb_build_object(
    'equipment_id',         p_id,
    'old_parent_id',        v_old_parent,
    'new_parent_id',        p_new_parent_id,
    'old_location_id',      v_old_loc,
    'new_location_id',      v_new_loc,
    'affected_descendants', v_affected);
end;
$$;

commit;
