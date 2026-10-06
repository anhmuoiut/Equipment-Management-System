-- =============================================================================
-- 04_functions.sql — NGHIỆP VỤ của database (chạy sau 02_schema.sql).
--
-- 1. Lịch sử tự động: mọi thêm / sửa / xóa trên bảng chính tự ghi vào
--    <module>_histories trong cùng giao dịch (trigger write_history).
-- 2. app_write: một cửa ghi dữ liệu cho server — thêm / sửa / xóa một dòng,
--    kèm người thao tác, ghi chú, nguồn (ui / import / script).
-- 3. Equipment: đổi vị trí, Move / Detach / Swap, xóa — thiết bị con đi theo
--    hoặc ở lại chỗ cũ (p_children); import Excel; Type theo Part Number (3b);
--    Level theo thiết bị cha (3c).
-- 4. Calibration: tự tính due_date; tính lại khi đổi chu kỳ / part number.
-- 5. Dashboard: view recent_activities (thay đổi gần đây; import gộp một dòng).
--
-- Chạy lại nhiều lần được (create or replace).
-- =============================================================================

begin;

-- =============================================================================
-- 0. NGỮ CẢNH GIAO DỊCH — ai thao tác, hành động, ghi chú, nguồn
--    (set_config(..., true) chỉ sống trong giao dịch hiện tại)
-- =============================================================================
create or replace function public.ctx(p_key text) returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.' || p_key, true), '')
$$;

create or replace function public.set_ctx(p_key text, p_value text) returns void
language sql set search_path = '' as $$
  select set_config('app.' || p_key, coalesce(p_value, ''), true)
$$;

-- =============================================================================
-- 1. LỊCH SỬ TỰ ĐỘNG
-- =============================================================================

-- Cột FK → chữ hiển thị tại thời điểm thay đổi.
create or replace function public.history_ref_label(p_column text, p_id uuid) returns text
language plpgsql stable set search_path = '' as $$
declare
  v text;
begin
  if p_id is null then return null; end if;
  case p_column
    when 'part_number_id' then select display_name into v from public.part_numbers where id = p_id;
    when 'type_id'        then select display_name into v from public.types where id = p_id;
    when 'status_id'      then select display_name into v from public.statuses where id = p_id;
    when 'level_id'       then select display_name into v from public.levels where id = p_id;
    when 'location_id'    then select display_name into v from public.locations where id = p_id;
    when 'department_id'  then select display_name into v from public.departments where id = p_id;
    when 'vendor_id'      then select display_name into v from public.calibration_vendors where id = p_id;
    when 'parent_id', 'equipment_id' then
      select serial_number into v from public.equipments where id = p_id;
      if v is null then  -- thiết bị đã bị xóa (ví dụ cha bị xóa cùng cây): SN gần nhất trong lịch sử
        select h.label into v from public.equipment_histories h where h.equipment_id = p_id order by h.created_at desc limit 1;
      end if;
    when 'approved_by'    then select username into v from public.user_profiles where id = p_id;
    else v := null;
  end case;
  return coalesce(v, p_id::text);
end;
$$;

-- { trường: { old, new } } — chỉ trường thay đổi; FK lưu chữ hiển thị, tên bỏ đuôi _id.
create or replace function public.history_diff(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  k text;
  v_old jsonb;
  v_new jsonb;
  v_out jsonb := '{}'::jsonb;
  v_fk constant text[] := array['part_number_id', 'type_id', 'status_id', 'level_id', 'location_id',
    'department_id', 'vendor_id', 'parent_id', 'equipment_id', 'approved_by'];
  v_skip constant text[] := array['id', 'created_at', 'created_by', 'updated_at', 'updated_by',
    'password_hash', 'token_version', 'sessions_revoked_at'];
begin
  for k in select jsonb_object_keys(p_old) union select jsonb_object_keys(p_new) loop
    continue when k = any (v_skip);
    v_old := nullif(p_old -> k, 'null'::jsonb);
    v_new := nullif(p_new -> k, 'null'::jsonb);
    continue when v_old is not distinct from v_new;
    if k = any (v_fk) then
      v_out := v_out || jsonb_build_object(
        case when k = 'approved_by' then k else regexp_replace(k, '_id$', '') end,
        jsonb_build_object(
          'old', public.history_ref_label(k, (v_old #>> '{}')::uuid),
          'new', public.history_ref_label(k, (v_new #>> '{}')::uuid)));
    else
      v_out := v_out || jsonb_build_object(k, jsonb_build_object('old', v_old, 'new', v_new));
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.write_history() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_id      uuid  := (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'id')::uuid;
  v_changes jsonb;
  v_keys    text[];
  v_action  text  := public.ctx('action');
  v_note    text  := public.ctx('note');
  v_source  text  := coalesce(public.ctx('source'), 'ui');
  v_actor   uuid;
  v_label   text;
begin
  v_changes := public.history_diff(coalesce(v_old, '{}'::jsonb), coalesce(v_new, '{}'::jsonb));
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(v_changes) k;
  v_actor := coalesce(public.ctx('actor_id')::uuid,
    case when tg_op = 'INSERT' then (v_row ->> 'created_by')::uuid else (v_row ->> 'updated_by')::uuid end);

  -- ---------------------------------------------------------------- Equipment
  if tg_table_name = 'equipments' then
    if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then return null; end if;
    v_label := v_row ->> 'serial_number';
    if tg_op = 'INSERT' then v_action := 'CREATE';
    elsif tg_op = 'DELETE' then
      v_action := 'DELETE';
      if public.ctx('delete_root') is not null and public.ctx('delete_root') <> v_id::text then
        v_note := 'via_parent:' || public.ctx('delete_root_label');
      end if;
    elsif v_action is distinct from 'SWAP' then
      v_action := case
        when 'parent' = any (v_keys) and v_new ->> 'parent_id' is null then 'DETACH'
        when 'parent' = any (v_keys) then 'MOVE'
        when v_keys = array['location'] then 'CHANGE_LOCATION'
        else 'UPDATE' end;
    end if;
    insert into public.equipment_histories (equipment_id, label, action, changes, note, source, created_by)
    values (v_id, v_label, v_action, v_changes, v_note, v_source, v_actor);

  -- ------------------------------------------------------------ Golden sample
  elsif tg_table_name = 'golden_samples' then
    if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then return null; end if;
    v_label := v_row ->> 'serial_number';
    v_action := case tg_op when 'INSERT' then 'CREATE' when 'DELETE' then 'DELETE'
      else case when v_keys = array['location'] then 'CHANGE_LOCATION' else 'UPDATE' end end;
    insert into public.golden_sample_histories (golden_sample_id, label, action, changes, note, source, created_by)
    values (v_id, v_label, v_action, v_changes, v_note, v_source, v_actor);

  -- -------------------------------------------------------------- Calibration
  elsif tg_table_name = 'calibration_equipments' then
    if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then return null; end if;
    select serial_number into v_label from public.equipments where id = (v_row ->> 'equipment_id')::uuid;
    if v_label is null then  -- thiết bị vừa bị xóa (xóa theo dây chuyền)
      select h.label into v_label from public.calibration_histories h
      where h.equipment_id = (v_row ->> 'equipment_id')::uuid order by h.created_at desc limit 1;
    end if;
    v_label := coalesce(v_label, v_row ->> 'equipment_id');
    if tg_op = 'INSERT' then
      v_action := 'ADD';
      select v_changes
        || jsonb_build_object('part_number', jsonb_build_object('old', null, 'new', pn.display_name))
        || jsonb_build_object('interval_months', jsonb_build_object('old', null, 'new', cc.interval_months))
      into v_changes
      from public.equipments e
      left join public.part_numbers pn on pn.id = e.part_number_id
      left join public.calibration_configurations cc on cc.part_number_id = e.part_number_id
      where e.id = (v_row ->> 'equipment_id')::uuid;
      v_changes := v_changes - 'equipment';
    elsif tg_op = 'DELETE' then v_action := 'REMOVE';
    else v_action := case when 'calibration_date' = any (v_keys) then 'CALIBRATE' else 'UPDATE' end;
    end if;
    insert into public.calibration_histories (equipment_id, label, action, changes, note, source, created_by)
    values ((v_row ->> 'equipment_id')::uuid, v_label, v_action, coalesce(v_changes, '{}'::jsonb), v_note, v_source, v_actor);

  -- ------------------------------------------------------------ Configuration
  elsif tg_table_name in ('part_numbers', 'locations', 'types', 'statuses', 'levels', 'departments',
                          'calibration_configurations', 'calibration_vendors') then
    if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then return null; end if;
    if tg_table_name = 'calibration_configurations' then
      v_label := public.history_ref_label('part_number_id', (v_row ->> 'part_number_id')::uuid);
    else
      v_label := v_row ->> 'display_name';
    end if;
    v_action := case tg_op when 'INSERT' then 'CREATE' when 'DELETE' then 'DELETE' else 'UPDATE' end;
    insert into public.configuration_histories (table_name, record_id, label, action, changes, note, source, created_by)
    values (tg_table_name, v_id, v_label, v_action, v_changes, v_note, v_source, v_actor);

  -- -------------------------------------------------------------- User profile
  elsif tg_table_name = 'user_profiles' then
    v_label := v_row ->> 'username';
    if tg_op = 'INSERT' then
      -- created_by trống = tự đăng ký; riêng script tạo admin đầu tiên (source = script) là CREATE.
      v_action := case when v_row ->> 'created_by' is null and v_source <> 'script' then 'REGISTER' else 'CREATE' end;
    elsif tg_op = 'DELETE' then
      return null;
    elsif v_action = 'PASSWORD_RESET' then
      null;  -- do server đặt khi admin đặt lại mật khẩu
    else
      if v_changes = '{}'::jsonb then return null; end if;
      v_action := case
        when 'account_status' = any (v_keys) then
          case
            when v_old ->> 'account_status' = 'pending' and v_new ->> 'account_status' = 'active' then 'APPROVE'
            when v_new ->> 'account_status' = 'rejected' then 'REJECT'
            when v_new ->> 'account_status' = 'disabled' then 'DISABLE'
            when v_new ->> 'account_status' = 'active' then 'ENABLE'
            else 'UPDATE' end
        when 'role' = any (v_keys) then 'ROLE_CHANGE'
        else 'UPDATE' end;
    end if;
    insert into public.user_histories (user_id, label, action, changes, note, source, created_by)
    values (v_id, v_label, v_action, v_changes, v_note, v_source, v_actor);
  end if;

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['equipments', 'golden_samples', 'calibration_equipments', 'user_profiles',
    'part_numbers', 'locations', 'types', 'statuses', 'levels', 'departments',
    'calibration_configurations', 'calibration_vendors'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_write_history', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.write_history()', t || '_write_history', t);
  end loop;
end
$$;

-- =============================================================================
-- 2. app_write — thêm / sửa / xóa một dòng, kèm ngữ cảnh lịch sử
--    p_op: 'insert' | 'update' | 'delete'. Chỉ ghi các cột có trong p_data.
--    Trả về dòng sau khi ghi (delete: dòng trước khi xóa).
-- =============================================================================
create or replace function public.app_write(
  p_table  text,
  p_op     text,
  p_id     uuid,
  p_data   jsonb,
  p_actor  uuid,
  p_action text default null,
  p_note   text default null,
  p_source text default 'ui'
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_allowed text[];
  v_cols    text;
  v_vals    text;
  v_sets    text;
  v_result  jsonb;
begin
  if p_table not in ('equipments', 'golden_samples', 'calibration_equipments', 'user_profiles',
                     'part_numbers', 'locations', 'types', 'statuses', 'levels', 'departments',
                     'calibration_configurations', 'calibration_vendors') then
    raise exception 'VALIDATION_ERROR' using detail = 'table not writable: ' || p_table;
  end if;
  if p_op = 'delete' and p_table = 'user_profiles' then
    raise exception 'VALIDATION_ERROR' using detail = 'accounts are disabled, never deleted';
  end if;

  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('action', p_action);
  perform public.set_ctx('note', p_note);
  perform public.set_ctx('source', coalesce(p_source, 'ui'));

  -- id chỉ được đặt khi thêm mới (tài khoản Supabase: id = id của Supabase Auth).
  select array_agg(column_name::text) into v_allowed
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    and column_name not in ('created_at', 'created_by', 'updated_at', 'updated_by')
    and (column_name <> 'id' or p_op = 'insert');

  select string_agg(format('%I', k), ', '),
         string_agg(format('r.%I', k), ', '),
         string_agg(format('%I = r.%I', k, k), ', ')
  into v_cols, v_vals, v_sets
  from jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) k
  where k = any (v_allowed);

  if p_op = 'insert' then
    execute format(
      'insert into public.%I as t (%s created_by, updated_by)
       select %s $2, $2 from jsonb_populate_record(null::public.%I, $1) r
       returning to_jsonb(t.*)',
      p_table, coalesce(v_cols || ', ', ''), coalesce(v_vals || ', ', ''), p_table)
    using p_data, p_actor into v_result;
  elsif p_op = 'update' then
    execute format(
      'update public.%I as t set %s updated_by = $2
       from jsonb_populate_record(null::public.%I, $1) r
       where t.id = $3
       returning to_jsonb(t.*)',
      p_table, coalesce(v_sets || ', ', ''), p_table)
    using p_data, p_actor, p_id into v_result;
  elsif p_op = 'delete' then
    execute format('delete from public.%I as t where t.id = $1 returning to_jsonb(t.*)', p_table)
    using p_id into v_result;
  else
    raise exception 'VALIDATION_ERROR' using detail = 'unknown op: ' || p_op;
  end if;

  if v_result is null then raise exception 'NOT_FOUND'; end if;
  return v_result;
end;
$$;

-- =============================================================================
-- 3. EQUIPMENT — thao tác cây cha–con
--
-- Thao tác di chuyển / xóa một thiết bị có con nhận p_children:
--   'follow' — con (cả nhánh) đi theo thiết bị (mặc định);
--   'stay'   — con trực tiếp ở lại đúng chỗ cũ (giữ vị trí) và gắn vào:
--              thiết bị đến thay (Swap), hoặc thiết bị cha cũ (Move / Detach /
--              Xóa); không có cha cũ (hoặc Đổi vị trí) thì con đứng riêng.
-- Cháu luôn đi cùng con của nó. Ghi chú lịch sử của con ở lại:
-- stayed:<SN> (Move / Detach / Đổi vị trí), stayed_swap:<SN>, parent_deleted:<SN>.
-- =============================================================================

-- Thiết bị và toàn bộ con cháu.
create or replace function public.equipment_subtree_ids(p_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  with recursive tree as (
    select id from public.equipments where id = p_id
    union all
    select e.id from public.equipments e join tree on e.parent_id = tree.id
  )
  select id from tree
$$;

-- Con trực tiếp.
create or replace function public.equipment_child_ids(p_id uuid) returns uuid[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from public.equipments where parent_id = p_id
$$;

-- p_children: null → 'follow'; giá trị khác follow / stay → lỗi.
create or replace function public.equipment_children_mode(p_children text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_children is null then return 'follow'; end if;
  if p_children not in ('follow', 'stay') then
    raise exception 'VALIDATION_ERROR' using detail = 'children must be follow or stay';
  end if;
  return p_children;
end;
$$;

-- Con cháu (không gồm chính nó) đổi vị trí theo; ghi chú "theo thiết bị cha".
create or replace function public.equipment_cascade_location(p_id uuid, p_actor uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_location uuid;
  v_serial   text;
begin
  select location_id, serial_number into v_location, v_serial from public.equipments where id = p_id;
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', 'via_parent:' || v_serial);
  update public.equipments
  set location_id = v_location, updated_by = p_actor
  where id in (select public.equipment_subtree_ids(p_id)) and id <> p_id
    and location_id is distinct from v_location;
  perform public.set_ctx('note', null);
end;
$$;

-- Con ở lại: gắn p_ids vào p_parent (null = đứng riêng), giữ nguyên vị trí;
-- lịch sử ghi MOVE / DETACH với ghi chú p_note.
create or replace function public.equipment_reparent(p_ids uuid[], p_parent uuid, p_actor uuid, p_note text) returns void
language plpgsql set search_path = '' as $$
begin
  if coalesce(cardinality(p_ids), 0) = 0 then return; end if;
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', p_note);
  update public.equipments set parent_id = p_parent, updated_by = p_actor where id = any (p_ids);
  perform public.set_ctx('note', null);
end;
$$;

-- Đổi vị trí — chỉ thiết bị không có cha. follow: cả cây con đi theo;
-- stay: con đứng riêng tại vị trí cũ.
create or replace function public.equipment_change_location(
  p_id uuid, p_location_id uuid, p_actor uuid, p_children text default 'follow'
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_mode text := public.equipment_children_mode(p_children);
  v_row  public.equipments;
begin
  select * into v_row from public.equipments where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_row.parent_id is not null then raise exception 'LOCATION_INHERITED_READ_ONLY'; end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'ui');
  if v_mode = 'stay' then
    perform public.equipment_reparent(public.equipment_child_ids(p_id), null, p_actor, 'stayed:' || v_row.serial_number);
  end if;
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  update public.equipments set location_id = p_location_id, updated_by = p_actor where id = p_id;
  perform public.equipment_cascade_location(p_id, p_actor);
  return (select to_jsonb(e.*) from public.equipments e where id = p_id);
end;
$$;

-- Đổi cha / gắn vào cha (Move) — vị trí lấy theo cha mới; không được tạo vòng lặp.
-- stay: con gắn vào cha cũ (hoặc đứng riêng), giữ vị trí.
create or replace function public.equipment_move(
  p_id uuid, p_parent_id uuid, p_actor uuid, p_children text default 'follow'
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_mode   text := public.equipment_children_mode(p_children);
  v_row    public.equipments;
  v_parent public.equipments;
begin
  select * into v_row from public.equipments where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  select * into v_parent from public.equipments where id = p_parent_id;
  if not found then raise exception 'PARENT_NOT_FOUND'; end if;
  if p_parent_id in (select public.equipment_subtree_ids(p_id)) then raise exception 'PARENT_CYCLE_DETECTED'; end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'ui');
  if v_mode = 'stay' then
    perform public.equipment_reparent(public.equipment_child_ids(p_id), v_row.parent_id, p_actor, 'stayed:' || v_row.serial_number);
  end if;
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  update public.equipments
  set parent_id = p_parent_id, location_id = v_parent.location_id, updated_by = p_actor
  where id = p_id;
  perform public.equipment_cascade_location(p_id, p_actor);
  return (select to_jsonb(e.*) from public.equipments e where id = p_id);
end;
$$;

-- Tách khỏi cha — giữ nguyên vị trí hiện tại. stay: con ở lại với cha cũ.
create or replace function public.equipment_detach(p_id uuid, p_actor uuid, p_children text default 'follow') returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_mode text := public.equipment_children_mode(p_children);
  v_row  public.equipments;
begin
  select * into v_row from public.equipments where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if v_row.parent_id is null then raise exception 'EQUIPMENT_HAS_NO_PARENT'; end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'ui');
  if v_mode = 'stay' then
    perform public.equipment_reparent(public.equipment_child_ids(p_id), v_row.parent_id, p_actor, 'stayed:' || v_row.serial_number);
  end if;
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  update public.equipments set parent_id = null, updated_by = p_actor where id = p_id;
  return (select to_jsonb(e.*) from public.equipments e where id = p_id);
end;
$$;

-- Đổi chỗ hai thiết bị: mỗi bên nhận cha + vị trí + trạng thái của bên kia (trạng thái
-- đi theo chỗ: thiết bị vào chỗ đang chạy nhận Active, thiết bị ra dự phòng nhận Inactive…).
-- Level theo cha mới (mục 3c). Thiết bị con không đổi trạng thái.
-- follow: mỗi bên mang theo cả nhánh con; stay: con ở lại chỗ cũ và gắn vào
-- thiết bị đến thay (con của A → B, con của B → A). Không cho swap với cha / con
-- của chính nó, và chặn swap không thay đổi gì (cùng cha, cùng vị trí).
create or replace function public.equipment_swap(p_a uuid, p_b uuid, p_actor uuid, p_children text default 'follow') returns void
language plpgsql set search_path = '' as $$
declare
  v_mode   text := public.equipment_children_mode(p_children);
  a        public.equipments;
  b        public.equipments;
  v_a_kids uuid[];
  v_b_kids uuid[];
begin
  if p_a = p_b then raise exception 'SWAP_INVALID'; end if;
  select * into a from public.equipments where id = p_a for update;
  select * into b from public.equipments where id = p_b for update;
  if a.id is null or b.id is null then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  if p_b in (select public.equipment_subtree_ids(p_a)) or p_a in (select public.equipment_subtree_ids(p_b)) then
    raise exception 'SWAP_INVALID_ANCESTOR_RELATION';
  end if;
  v_a_kids := public.equipment_child_ids(p_a);
  v_b_kids := public.equipment_child_ids(p_b);
  if a.parent_id is not distinct from b.parent_id and a.location_id = b.location_id
     and (v_mode = 'follow' or (cardinality(v_a_kids) = 0 and cardinality(v_b_kids) = 0)) then
    raise exception 'SWAP_NO_CHANGE';
  end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'ui');
  perform public.set_ctx('action', 'SWAP');
  perform public.set_ctx('note', 'swap_with:' || b.serial_number);
  update public.equipments
     set parent_id = b.parent_id, location_id = b.location_id, status_id = b.status_id, updated_by = p_actor
   where id = p_a;
  perform public.set_ctx('note', 'swap_with:' || a.serial_number);
  update public.equipments
     set parent_id = a.parent_id, location_id = a.location_id, status_id = a.status_id, updated_by = p_actor
   where id = p_b;
  if v_mode = 'stay' then
    perform public.equipment_reparent(v_a_kids, p_b, p_actor, 'stayed_swap:' || a.serial_number);
    perform public.equipment_reparent(v_b_kids, p_a, p_actor, 'stayed_swap:' || b.serial_number);
  end if;
  perform public.equipment_cascade_location(p_a, p_actor);
  perform public.equipment_cascade_location(p_b, p_actor);
end;
$$;

-- Xóa thiết bị. follow: cả cây con bị xóa theo (on delete cascade), lịch sử ghi
-- từng thiết bị; stay: chỉ xóa thiết bị này, con gắn vào cha cũ (hoặc đứng riêng).
-- Trả về số thiết bị đã xóa.
create or replace function public.equipment_delete(p_id uuid, p_actor uuid, p_children text default 'follow') returns integer
language plpgsql set search_path = '' as $$
declare
  v_mode  text := public.equipment_children_mode(p_children);
  v_row   public.equipments;
  v_count integer;
begin
  select * into v_row from public.equipments where id = p_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND'; end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'ui');
  if v_mode = 'stay' then
    perform public.equipment_reparent(public.equipment_child_ids(p_id), v_row.parent_id, p_actor, 'parent_deleted:' || v_row.serial_number);
  end if;
  select count(*) into v_count from public.equipment_subtree_ids(p_id);
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  perform public.set_ctx('delete_root', p_id::text);
  perform public.set_ctx('delete_root_label', v_row.serial_number);
  delete from public.equipments where id = p_id;
  perform public.set_ctx('delete_root', null);
  return v_count;
end;
$$;

-- Import Excel — thêm nhiều thiết bị trong MỘT giao dịch: lỗi một dòng thì
-- không dòng nào được ghi. Server đã kiểm tra từng dòng trước khi gọi, đặt sẵn
-- id để dòng con trỏ được tới dòng cha trong cùng file (parent_id), và đặt
-- location_id của dòng con = vị trí của cha.
-- Lịch sử: CREATE cho từng thiết bị, source = import. Trả về số thiết bị đã thêm.
create or replace function public.equipment_import(p_rows jsonb, p_actor uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'VALIDATION_ERROR' using detail = 'no rows';
  end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'import');
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  insert into public.equipments
    (id, serial_number, jabil_id, part_number_id, asset, type_id, level_id, status_id, location_id, parent_id, remark,
     created_by, updated_by)
  select coalesce(r.id, gen_random_uuid()), r.serial_number, r.jabil_id, r.part_number_id, r.asset, r.type_id, r.level_id,
         r.status_id, r.location_id, r.parent_id, r.remark, p_actor, p_actor
  from jsonb_populate_recordset(null::public.equipments, p_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Import Excel cho Golden sample — thêm nhiều dòng trong MỘT giao dịch (một dòng
-- lỗi thì không dòng nào được ghi). Server đã kiểm tra từng dòng trước khi gọi.
-- Lịch sử: CREATE cho từng golden sample, source = import. Trả về số dòng đã thêm.
create or replace function public.golden_import(p_rows jsonb, p_actor uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'VALIDATION_ERROR' using detail = 'no rows';
  end if;
  perform public.set_ctx('actor_id', p_actor::text);
  perform public.set_ctx('source', 'import');
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', null);
  insert into public.golden_samples
    (part_number, serial_number, utd_part_number, location_id, status_id, origin, purpose, remark, created_by, updated_by)
  select r.part_number, r.serial_number, r.utd_part_number, r.location_id, r.status_id, r.origin, r.purpose, r.remark,
         p_actor, p_actor
  from jsonb_populate_recordset(null::public.golden_samples, p_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================================
-- 3b. EQUIPMENT — Type theo Part Number (part_numbers.type_id)
--     Thiết bị có part number → luôn mang đúng Type của part number, dù ghi từ
--     form, Import Excel hay script (Type gửi lên bị thay). Không có part number
--     → Type chọn tay. Admin đổi Type của part number → mọi thiết bị của part
--     number đổi theo; lịch sử thiết bị ghi UPDATE "type", ghi chú via_part_number:<PN>.
-- =============================================================================
create or replace function public.equipment_type_from_part_number() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.part_number_id is not null then
    select type_id into new.type_id from public.part_numbers where id = new.part_number_id;
  end if;
  return new;
end;
$$;
drop trigger if exists equipments_type_from_part_number on public.equipments;
create trigger equipments_type_from_part_number
  before insert or update of part_number_id, type_id on public.equipments
  for each row execute function public.equipment_type_from_part_number();

-- Chạy trước part_numbers_write_history (trigger cùng loại chạy theo thứ tự tên) →
-- trả lại ghi chú cũ để lịch sử của chính part number không mang via_part_number.
create or replace function public.part_number_type_changed() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_note text := public.ctx('note');
begin
  perform public.set_ctx('note', 'via_part_number:' || new.display_name);
  update public.equipments
     set type_id = new.type_id, updated_by = public.ctx('actor_id')::uuid
   where part_number_id = new.id and type_id is distinct from new.type_id;
  perform public.set_ctx('note', v_note);
  return null;
end;
$$;
drop trigger if exists part_numbers_type_changed on public.part_numbers;
create trigger part_numbers_type_changed
  after update of type_id on public.part_numbers
  for each row when (new.type_id is distinct from old.type_id)
  execute function public.part_number_type_changed();

-- =============================================================================
-- 3c. EQUIPMENT — Level theo thiết bị cha (như vị trí)
--     Có cha → luôn mang Level của cha, dù ghi từ form, Đổi cha, Swap, Import hay
--     script (Level gửi lên bị thay). Không có cha → Level chọn tay; Tách khỏi cha
--     giữ Level đang có. Cha đổi Level → cả cây con đổi theo; lịch sử của con ghi
--     ghi chú via_parent:<SN>.
-- =============================================================================
create or replace function public.equipment_level_from_parent() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_level uuid;
begin
  if new.parent_id is not null then
    -- Cha chưa có (Import: dòng cha nằm sau trong cùng file) → giữ giá trị server đã đặt theo cha.
    select level_id into v_level from public.equipments where id = new.parent_id;
    if found then new.level_id := v_level; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists equipments_level_from_parent on public.equipments;
create trigger equipments_level_from_parent
  before insert or update of parent_id, level_id on public.equipments
  for each row execute function public.equipment_level_from_parent();

-- Chạy trước equipments_write_history (theo thứ tự tên) → trả lại ngữ cảnh để lịch sử
-- của chính thiết bị giữ đúng hành động / ghi chú (ví dụ SWAP, swap_with:<SN>).
create or replace function public.equipment_level_cascade() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_action text := public.ctx('action');
  v_note   text := public.ctx('note');
begin
  perform public.set_ctx('action', null);
  perform public.set_ctx('note', 'via_parent:' || new.serial_number);
  update public.equipments
     set level_id = new.level_id, updated_by = coalesce(public.ctx('actor_id')::uuid, new.updated_by)
   where parent_id = new.id and level_id is distinct from new.level_id;
  perform public.set_ctx('action', v_action);
  perform public.set_ctx('note', v_note);
  return null;
end;
$$;
-- Không dùng "update of level_id": Đổi cha / Swap đổi Level qua trigger trên (cột không
-- nằm trong câu update) — vẫn phải lan xuống con.
drop trigger if exists equipments_level_cascade on public.equipments;
create trigger equipments_level_cascade
  after update on public.equipments
  for each row when (new.level_id is distinct from old.level_id)
  execute function public.equipment_level_cascade();

-- =============================================================================
-- 4. CALIBRATION — due_date = calibration_date + chu kỳ của part number
-- =============================================================================
create or replace function public.calibration_compute_due() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_interval integer;
begin
  select cc.interval_months into v_interval
  from public.equipments e
  join public.calibration_configurations cc on cc.part_number_id = e.part_number_id
  where e.id = new.equipment_id;
  if tg_op = 'INSERT' and v_interval is null then raise exception 'CALIBRATION_INTERVAL_MISSING'; end if;
  new.due_date := case
    when new.calibration_date is null or v_interval is null then null
    else (new.calibration_date + make_interval(months => v_interval))::date end;
  return new;
end;
$$;
drop trigger if exists calibration_equipments_compute_due on public.calibration_equipments;
create trigger calibration_equipments_compute_due before insert or update on public.calibration_equipments
  for each row execute function public.calibration_compute_due();

-- Dashboard hiệu chuẩn tự đồng bộ với Configuration › Hiệu chuẩn › Setup:
-- thiết bị có part number trong calibration_configurations luôn có đúng một dòng
-- calibration_equipments; không còn thì dòng bị bỏ (lịch sử REMOVE vẫn giữ).
-- Trạng thái là của thiết bị (equipments.status_id). Người ghi lịch sử = người thao tác gốc (ctx).

-- Thêm part number vào Setup → mọi thiết bị của PN lên Dashboard; xóa → rời Dashboard.
create or replace function public.calibration_sync_configuration() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_actor uuid := public.ctx('actor_id')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.calibration_equipments (equipment_id, created_by, updated_by)
    select e.id, v_actor, v_actor
    from public.equipments e
    where e.part_number_id = new.part_number_id
      and not exists (select 1 from public.calibration_equipments ce where ce.equipment_id = e.id);
    return null;
  end if;
  delete from public.calibration_equipments ce
  using public.equipments e
  where e.id = ce.equipment_id and e.part_number_id = old.part_number_id;
  return null;
end;
$$;
drop trigger if exists calibration_configurations_sync on public.calibration_configurations;
create trigger calibration_configurations_sync after insert or delete on public.calibration_configurations
  for each row execute function public.calibration_sync_configuration();

-- Đổi chu kỳ → tính lại due_date của mọi thiết bị cùng part number.
create or replace function public.calibration_configuration_changed() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.calibration_equipments ce set updated_at = now()
  from public.equipments e
  where e.id = ce.equipment_id and e.part_number_id = new.part_number_id;
  return null;
end;
$$;
drop trigger if exists calibration_configurations_changed on public.calibration_configurations;
create trigger calibration_configurations_changed
  after update of interval_months on public.calibration_configurations
  for each row execute function public.calibration_configuration_changed();

-- Thêm thiết bị / đổi part number: PN trong Setup → có dòng trên Dashboard (đổi PN
-- thì tính lại due_date); PN không trong Setup → không có dòng.
create or replace function public.calibration_equipment_part_changed() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_actor uuid := public.ctx('actor_id')::uuid;
begin
  if not exists (select 1 from public.calibration_configurations where part_number_id = new.part_number_id) then
    delete from public.calibration_equipments where equipment_id = new.id;
  elsif exists (select 1 from public.calibration_equipments where equipment_id = new.id) then
    update public.calibration_equipments set updated_at = now() where equipment_id = new.id;
  else
    insert into public.calibration_equipments (equipment_id, created_by, updated_by)
    values (new.id, v_actor, v_actor);
  end if;
  return null;
end;
$$;
drop trigger if exists equipments_calibration_part_changed on public.equipments;
create trigger equipments_calibration_part_changed after insert or update of part_number_id on public.equipments
  for each row execute function public.calibration_equipment_part_changed();

-- =============================================================================
-- 5. DASHBOARD — thay đổi gần đây (gộp các bảng lịch sử, không lưu dữ liệu)
--    Dòng của configuration / user chỉ Admin thấy — app lọc theo nhóm quyền.
--    Import Excel ghi mỗi dòng một bản ghi lịch sử cùng created_at (một giao dịch):
--    gộp thành MỘT dòng cho mỗi (module, người import, lần import); item_count = số dòng.
--    Dòng khác item_count = 1.
-- =============================================================================
create or replace view public.recent_activities with (security_invoker = true) as
with activity as (
  select 'equipment'::text as module, equipment_id as object_id, label, action, changes, created_by, created_at, note, source
  from public.equipment_histories
  union all
  select 'calibration', equipment_id, label, action, changes, created_by, created_at, note, source
  from public.calibration_histories
  union all
  select 'golden_sample', golden_sample_id, label, action, changes, created_by, created_at, note, source
  from public.golden_sample_histories
  union all
  select 'configuration', record_id, label, action, changes, created_by, created_at, note, source
  from public.configuration_histories
  union all
  select 'user', user_id, label, action, changes, created_by, created_at, note, source
  from public.user_histories
)
select module, object_id, label, action, changes, created_by, created_at, note, source, 1 as item_count
from activity
where source <> 'import'
union all
select module, object_id, label, action, changes, created_by, created_at, note, source, item_count
from (
  select distinct on (module, created_by, created_at)
         module, object_id, label, action, changes, created_by, created_at, note, source,
         count(*) over (partition by module, created_by, created_at)::integer as item_count
  from activity
  where source = 'import'
  order by module, created_by, created_at, label
) imported;

revoke all on public.recent_activities from public, anon, authenticated;
grant select on public.recent_activities to service_role;

-- =============================================================================
-- 6. BẢO MẬT — chỉ server (service_role) gọi được
-- =============================================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: history_triggers phải là 12, app_write, equipment_import và golden_import phải là 1,
-- equipment_swap_args phải là 4 (có p_children — con đi theo / ở lại),
-- type_triggers phải là 2 (Type theo Part Number), level_triggers phải là 2 (Level theo thiết bị cha).
-- -----------------------------------------------------------------------------
select
  (select count(*) from pg_trigger where tgname ~ '_write_history$') as history_triggers,
  (select count(*) from pg_trigger
    where tgname in ('equipments_type_from_part_number', 'part_numbers_type_changed')) as type_triggers,
  (select count(*) from pg_trigger
    where tgname in ('equipments_level_from_parent', 'equipments_level_cascade')) as level_triggers,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_write') as app_write,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'equipment_import') as equipment_import,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'golden_import') as golden_import,
  (select string_agg(p.pronargs::text, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'equipment_swap') as equipment_swap_args;
