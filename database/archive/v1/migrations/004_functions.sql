-- =============================================================================
-- 004_functions.sql  —  Spec v0.9 mục 34, 45
-- =============================================================================
-- Checklist áp dụng cho MỌI RPC ghi dữ liệu (mục 34):
--   1. lock_timeout + statement_timeout  (Vercel kill function ở 10s)
--   2. lock hàng bằng `order by id ... for update`  (chống deadlock)
--   3. version check bằng `update ... where version = $n`  (chống TOCTOU)
--   4. validate cycle / archive state SAU khi đã lock
--   5. ghi audit_log trong cùng transaction
--   6. revoke/grant ở cuối file này
--   7. raise exception '<ERROR_CODE>' → service layer map sang HTTP
--
-- Các hàm là SECURITY INVOKER (mặc định). service_role bypass RLS nên không cần
-- SECURITY DEFINER; nếu anon key gọi lọt thì vẫn đâm vào RLS deny-all.
-- =============================================================================

-- =============================================================================
-- INTERNAL HELPERS
-- =============================================================================

-- Trả về id của p_root VÀ toàn bộ descendants. Raise nếu vượt 50 tầng.
create or replace function public.internal_subtree_ids(p_root uuid)
returns uuid[]
language plpgsql stable as $$
declare
  v_ids uuid[];
  v_max int;
begin
  with recursive tree as (
    select e.id, 0 as depth
      from public.equipment e
     where e.id = p_root
    union all
    select e.id, t.depth + 1
      from public.equipment e
      join tree t on e.parent_id = t.id
     where t.depth < 50
  )
  select array_agg(tree.id), coalesce(max(tree.depth), 0)
    into v_ids, v_max
    from tree;

  if v_max >= 50 then
    raise exception 'DEPTH_LIMIT_EXCEEDED';
  end if;

  return coalesce(v_ids, array[]::uuid[]);
end;
$$;

-- Trả về id của toàn bộ ancestors (KHÔNG gồm chính nó). Raise nếu vượt 50 tầng.
create or replace function public.internal_ancestor_ids(p_id uuid)
returns uuid[]
language plpgsql stable as $$
declare
  v_ids uuid[];
  v_max int;
begin
  with recursive up as (
    select e.id, e.parent_id, 0 as depth
      from public.equipment e
     where e.id = p_id
    union all
    select e.id, e.parent_id, u.depth + 1
      from public.equipment e
      join up u on e.id = u.parent_id
     where u.depth < 50
  )
  select array_agg(up.id) filter (where up.depth > 0), coalesce(max(up.depth), 0)
    into v_ids, v_max
    from up;

  if v_max >= 50 then
    raise exception 'DEPTH_LIMIT_EXCEEDED';
  end if;

  return coalesce(v_ids, array[]::uuid[]);
end;
$$;

-- Khoá hàng theo THỨ TỰ ID XÁC ĐỊNH.
-- Bắt buộc: nếu khoá theo thứ tự tham số thì 2 Swap ngược chiều sẽ deadlock.
create or replace function public.internal_lock_rows(p_ids uuid[])
returns void
language plpgsql as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  perform 1
     from public.equipment
    where id = any(p_ids)
    order by id
      for update;
end;
$$;

-- Cascade location xuống descendants + ghi MOVE_CASCADE.
-- KHÔNG bump version của descendants (mục 23): location của child đã là read-only
-- nên không có kịch bản save đè; bump chỉ tạo OPTIMISTIC_CONFLICT giả.
create or replace function public.internal_cascade_location(
  p_ids        uuid[],
  p_exclude    uuid,
  p_new_loc    uuid,
  p_actor      uuid,
  p_request_id text,
  p_cause      uuid
) returns integer
language plpgsql as $$
declare
  v_n int;
begin
  with target as (
    select e.id, e.current_location_id as old_loc
      from public.equipment e
     where e.id = any(p_ids)
       and e.id <> p_exclude
       and e.archived_at is null                          -- archived = snapshot đóng băng
       and e.current_location_id is distinct from p_new_loc
  ),
  upd as (
    update public.equipment e
       set current_location_id = p_new_loc,
           updated_by = p_actor
      from target t
     where e.id = t.id
    returning e.id, t.old_loc
  )
  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id, note)
  select 'equipment', u.id, 'MOVE_CASCADE',
         jsonb_build_object('current_location_id',
           jsonb_build_object('old', u.old_loc, 'new', p_new_loc)),
         p_actor, p_request_id,
         'caused_by=' || p_cause::text
    from upd u;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Lõi dùng chung cho MOVE / DETACH / SWAP.
-- p_new_parent_id = null  →  detach (giữ location cũ, không cascade)
-- p_version       = null  →  bỏ qua version check (caller đã check)
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

  -- Tính lại subtree SAU khi đã có lock của caller, rồi khoá lần nữa để bắt
  -- những child vừa được thêm giữa lúc caller tính và lúc caller khoá.
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

-- =============================================================================
-- READ FUNCTIONS  (mục 45)
-- =============================================================================

create or replace function public.get_equipment_ancestors(p_id uuid)
returns table (
  id uuid, serial_number text, part_number text, jabil_id text, asset text,
  types text, level text, status text, current_location_id uuid,
  parent_id uuid, archived_at timestamptz, depth int)
language plpgsql stable as $$
begin
  perform public.internal_ancestor_ids(p_id);   -- raise DEPTH_LIMIT_EXCEEDED nếu cần

  return query
  with recursive up as (
    select e.id, e.serial_number, e.part_number, e.jabil_id, e.asset,
           e.types, e.level, e.status, e.current_location_id,
           e.parent_id, e.archived_at, 0 as d
      from public.equipment e
     where e.id = p_id
    union all
    select e.id, e.serial_number, e.part_number, e.jabil_id, e.asset,
           e.types, e.level, e.status, e.current_location_id,
           e.parent_id, e.archived_at, u.d + 1
      from public.equipment e
      join up u on e.id = u.parent_id
     where u.d < 50
  )
  select up.id, up.serial_number, up.part_number, up.jabil_id, up.asset,
         up.types, up.level, up.status, up.current_location_id,
         up.parent_id, up.archived_at, up.d
    from up
   where up.d > 0
   order by up.d;
end;
$$;

create or replace function public.get_equipment_descendants(p_id uuid)
returns table (
  id uuid, serial_number text, part_number text, jabil_id text, asset text,
  types text, level text, status text, current_location_id uuid,
  parent_id uuid, archived_at timestamptz, depth int)
language plpgsql stable as $$
begin
  perform public.internal_subtree_ids(p_id);    -- raise DEPTH_LIMIT_EXCEEDED nếu cần

  return query
  with recursive down as (
    select e.id, e.serial_number, e.part_number, e.jabil_id, e.asset,
           e.types, e.level, e.status, e.current_location_id,
           e.parent_id, e.archived_at, 0 as d
      from public.equipment e
     where e.id = p_id
    union all
    select e.id, e.serial_number, e.part_number, e.jabil_id, e.asset,
           e.types, e.level, e.status, e.current_location_id,
           e.parent_id, e.archived_at, dn.d + 1
      from public.equipment e
      join down dn on e.parent_id = dn.id
     where dn.d < 50
  )
  select down.id, down.serial_number, down.part_number, down.jabil_id, down.asset,
         down.types, down.level, down.status, down.current_location_id,
         down.parent_id, down.archived_at, down.d
    from down
   where down.d > 0
   order by down.d, down.serial_number;
end;
$$;

-- =============================================================================
-- WRITE RPC
-- =============================================================================

-- CREATE  ---------------------------------------------------------------------
create or replace function public.create_equipment_with_audit(
  p_data       jsonb,
  p_actor      uuid,
  p_request_id text,
  p_source     text default 'ui'
) returns jsonb
language plpgsql as $$
declare
  v_parent  public.equipment%rowtype;
  v_loc     uuid;
  v_new     public.equipment%rowtype;
  v_parent_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_json    jsonb;
begin
  perform set_config('lock_timeout', '3s', true);

  v_parent_id := nullif(p_data->>'parent_id', '')::uuid;

  if v_parent_id is not null then
    select * into v_parent from public.equipment where id = v_parent_id for update;
    if not found then raise exception 'PARENT_NOT_FOUND'; end if;
    if v_parent.archived_at is not null then raise exception 'MOVE_TARGET_ARCHIVED'; end if;
    v_loc := v_parent.current_location_id;                 -- location kế thừa (mục 20)
  else
    v_loc := nullif(p_data->>'current_location_id', '')::uuid;
    if v_loc is null then raise exception 'LOCATION_REQUIRED'; end if;
  end if;

  if not exists (select 1 from public.locations where id = v_loc) then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.equipment (
    jabil_id, part_number, serial_number, asset, types, level, status,
    current_location_id, remark, parent_id, created_by, updated_by)
  values (
    nullif(p_data->>'jabil_id',''),    nullif(p_data->>'part_number',''),
    p_data->>'serial_number',          nullif(p_data->>'asset',''),
    nullif(p_data->>'types',''),       nullif(p_data->>'level',''),
    nullif(p_data->>'status',''),      v_loc,
    nullif(p_data->>'remark',''),      v_parent_id,
    p_actor, p_actor)
  returning * into v_new;

  v_json := to_jsonb(v_new);
  foreach v_key in array array['jabil_id','part_number','serial_number','asset',
                               'types','level','status','remark',
                               'current_location_id','parent_id'] loop
    v_changes := v_changes || jsonb_build_object(
      v_key, jsonb_build_object('old', null, 'new', v_json -> v_key));
  end loop;

  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id, source)
  values ('equipment', v_new.id, 'CREATE', v_changes, p_actor, p_request_id, p_source);

  return v_json;
end;
$$;

-- UPDATE  ---------------------------------------------------------------------
-- Single-row, KHÔNG cascade. current_location_id / parent_id bị chặn ở whitelist:
-- chúng chỉ đổi qua change-location / move / detach / swap (mục 7).
create or replace function public.update_equipment_with_audit(
  p_id         uuid,
  p_version    integer,
  p_changes    jsonb,
  p_actor      uuid,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_allowed text[] := array['jabil_id','part_number','serial_number',
                            'asset','types','level','status','remark'];
  v_key  text;
  v_sets text[] := '{}';
  v_old  jsonb;
  v_new  jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_sql  text;
begin
  perform set_config('lock_timeout', '3s', true);

  if p_changes is null or p_changes = '{}'::jsonb then
    raise exception 'VALIDATION_ERROR';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'VALIDATION_ERROR';
    end if;
    v_sets := v_sets || format('%I = ($1 ->> %L)', v_key, v_key);
  end loop;

  select to_jsonb(e) into v_old
    from public.equipment e where e.id = p_id for update;
  if v_old is null then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if (v_old ->> 'archived_at') is not null then raise exception 'EQUIPMENT_ARCHIVED'; end if;

  v_sql := format(
    'update public.equipment as e set %s, version = version + 1, updated_by = $2
      where e.id = $3 and e.version = $4 returning to_jsonb(e)',
    array_to_string(v_sets, ', '));

  execute v_sql into v_new using p_changes, p_actor, p_id, p_version;
  if v_new is null then raise exception 'OPTIMISTIC_CONFLICT'; end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if (v_old -> v_key) is distinct from (v_new -> v_key) then
      v_diff := v_diff || jsonb_build_object(v_key,
        jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
    end if;
  end loop;

  if v_diff <> '{}'::jsonb then
    insert into public.audit_log
          (entity_type, entity_id, action, changes, changed_by, request_id)
    values ('equipment', p_id, 'UPDATE', v_diff, p_actor, p_request_id);
  end if;

  return v_new;
end;
$$;

-- CHANGE LOCATION  ------------------------------------------------------------
-- Thao tác cascade multi-row, KHÔNG phải Edit thường (mục 21a).
create or replace function public.change_location_equipment(
  p_id              uuid,
  p_new_location_id uuid,
  p_version         integer,
  p_actor           uuid,
  p_request_id      text
) returns jsonb
language plpgsql as $$
declare
  v_ids      uuid[];
  v_node     public.equipment%rowtype;
  v_old_loc  uuid;
  v_affected int := 0;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '8s', true);

  if p_new_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;

  v_ids := public.internal_subtree_ids(p_id);
  perform public.internal_lock_rows(v_ids);

  select * into v_node from public.equipment where id = p_id;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_node.archived_at is not null then raise exception 'EQUIPMENT_ARCHIVED'; end if;
  if v_node.parent_id is not null then raise exception 'LOCATION_INHERITED_READ_ONLY'; end if;

  if not exists (select 1 from public.locations
                  where id = p_new_location_id and is_active) then
    raise exception 'VALIDATION_ERROR';
  end if;

  v_old_loc := v_node.current_location_id;

  update public.equipment
     set current_location_id = p_new_location_id,
         version             = version + 1,
         updated_by          = p_actor
   where id = p_id and version = p_version;
  if not found then raise exception 'OPTIMISTIC_CONFLICT'; end if;

  if p_new_location_id is distinct from v_old_loc then
    v_affected := public.internal_cascade_location(
      v_ids, p_id, p_new_location_id, p_actor, p_request_id, p_id);
  end if;

  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('equipment', p_id, 'CHANGE_LOCATION',
          jsonb_build_object('current_location_id', jsonb_build_object(
            'old', to_jsonb(v_old_loc), 'new', to_jsonb(p_new_location_id))),
          p_actor, p_request_id);

  return jsonb_build_object(
    'equipment_id',         p_id,
    'old_location_id',      v_old_loc,
    'new_location_id',      p_new_location_id,
    'affected_descendants', v_affected);
end;
$$;

-- MOVE  -----------------------------------------------------------------------
create or replace function public.move_equipment(
  p_id            uuid,
  p_new_parent_id uuid,
  p_version       integer,
  p_actor         uuid,
  p_request_id    text
) returns jsonb
language plpgsql as $$
declare
  v_lock uuid[];
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '8s', true);

  if p_new_parent_id is null then raise exception 'VALIDATION_ERROR'; end if;
  if p_id = p_new_parent_id then raise exception 'PARENT_CYCLE_DETECTED'; end if;

  v_lock := public.internal_subtree_ids(p_id) || array[p_new_parent_id];
  perform public.internal_lock_rows(v_lock);

  return public.internal_move(p_id, p_new_parent_id, p_version,
                              p_actor, p_request_id, 'MOVE');
end;
$$;

-- DETACH  ---------------------------------------------------------------------
create or replace function public.detach_equipment(
  p_id         uuid,
  p_version    integer,
  p_actor      uuid,
  p_request_id text
) returns jsonb
language plpgsql as $$
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '8s', true);

  perform public.internal_lock_rows(public.internal_subtree_ids(p_id));

  return public.internal_move(p_id, null, p_version, p_actor, p_request_id, 'DETACH');
end;
$$;

-- SWAP  -----------------------------------------------------------------------
-- KHÔNG viết RPC độc lập: Swap = 2 lần internal_move trong cùng transaction
-- (mục 24). Bug fix trong logic cascade chỉ phải sửa ở internal_move.
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

  -- Khoá UNION của 2 subtree theo thứ tự id.
  -- Đây là chỗ chống deadkick khi user 1 swap (A,B) còn user 2 swap (B,A).
  perform public.internal_lock_rows(v_ids_a || v_ids_b);

  select * into v_a from public.equipment where id = p_a;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  select * into v_b from public.equipment where id = p_b;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;

  if v_a.archived_at is not null or v_b.archived_at is not null then
    raise exception 'EQUIPMENT_ARCHIVED';
  end if;

  -- Compatibility: only equipment of the same Type may be swapped — Part
  -- Number is not considered. The UI pre-filters to eligible candidates,
  -- but the backend re-checks regardless (swap feature spec §3.12).
  if v_a.types is distinct from v_b.types then
    raise exception 'SWAP_INVALID';
  end if;

  if p_b = any(v_ids_a) or p_a = any(v_ids_b) then
    raise exception 'SWAP_INVALID_ANCESTOR_RELATION';
  end if;

  v_pa := v_a.parent_id;
  v_pb := v_b.parent_id;

  perform public.internal_lock_rows(array_remove(array[v_pa, v_pb], null));

  -- Không có trạng thái trung gian nào tạo cycle vì đã loại quan hệ
  -- ancestor/descendant ở trên.
  v_res_a := public.internal_move(p_a, v_pb, p_version_a, p_actor, p_request_id, 'SWAP', p_note);
  v_res_b := public.internal_move(p_b, v_pa, p_version_b, p_actor, p_request_id, 'SWAP', p_note);

  return jsonb_build_object('a', v_res_a, 'b', v_res_b);
end;
$$;

-- ARCHIVE  --------------------------------------------------------------------
create or replace function public.archive_equipment(
  p_id         uuid,
  p_version    integer,
  p_actor      uuid,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_node public.equipment%rowtype;
begin
  perform set_config('lock_timeout', '3s', true);

  select * into v_node from public.equipment where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_node.archived_at is not null then raise exception 'EQUIPMENT_ARCHIVED'; end if;

  -- CHỈ tính child CHƯA archive (mục 25). Nếu tính cả child đã archive thì
  -- workflow thanh lý cả cụm máy (archive con trước, rồi cha) sẽ bị chặn vĩnh viễn.
  if exists (select 1 from public.equipment
              where parent_id = p_id and archived_at is null) then
    raise exception 'ARCHIVE_BLOCKED_HAS_CHILDREN';
  end if;

  update public.equipment
     set archived_at = now(),
         archived_by = p_actor,
         version     = version + 1,
         updated_by  = p_actor
   where id = p_id and version = p_version;
  if not found then raise exception 'OPTIMISTIC_CONFLICT'; end if;

  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('equipment', p_id, 'ARCHIVE',
          jsonb_build_object('archived_at', jsonb_build_object('old', null, 'new', now())),
          p_actor, p_request_id);

  return jsonb_build_object('equipment_id', p_id, 'archived', true);
end;
$$;

-- RESTORE  --------------------------------------------------------------------
create or replace function public.restore_equipment(
  p_id         uuid,
  p_version    integer,
  p_actor      uuid,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_node public.equipment%rowtype;
begin
  perform set_config('lock_timeout', '3s', true);

  select * into v_node from public.equipment where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_node.archived_at is null then raise exception 'EQUIPMENT_NOT_ARCHIVED'; end if;

  -- Không tạo ra child sống dưới parent chết.
  if v_node.parent_id is not null
     and exists (select 1 from public.equipment
                  where id = v_node.parent_id and archived_at is not null) then
    raise exception 'MOVE_TARGET_ARCHIVED';
  end if;

  update public.equipment
     set archived_at = null,
         archived_by = null,
         version     = version + 1,
         updated_by  = p_actor
   where id = p_id and version = p_version;
  if not found then raise exception 'OPTIMISTIC_CONFLICT'; end if;

  insert into public.audit_log
        (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('equipment', p_id, 'RESTORE',
          jsonb_build_object('archived_at',
            jsonb_build_object('old', to_jsonb(v_node.archived_at), 'new', null)),
          p_actor, p_request_id);

  return jsonb_build_object('equipment_id', p_id, 'archived', false);
end;
$$;

-- =============================================================================
-- GRANTS  (mục 3c)
-- =============================================================================
-- PostgreSQL mặc định GRANT EXECUTE cho PUBLIC. Không có khối này, bất kỳ ai có
-- anon key (nằm công khai trong bundle frontend) cũng gọi được RPC.
-- =============================================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'internal_subtree_ids','internal_ancestor_ids','internal_lock_rows',
         'internal_cascade_location','internal_move',
         'get_equipment_ancestors','get_equipment_descendants',
         'create_equipment_with_audit','update_equipment_with_audit',
         'change_location_equipment','move_equipment','detach_equipment',
         'swap_equipment','archive_equipment','restore_equipment',
         'set_updated_at')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;
