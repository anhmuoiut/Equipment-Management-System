-- =============================================================================
-- FULL RESET — paste this whole file into Supabase SQL Editor and run once.
-- Drops every table (all equipment/location/user data, all history) and
-- recreates the schema from migrations 001–006. Irreversible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. DROP EVERYTHING
-- -----------------------------------------------------------------------------
begin;
drop table if exists public.error_log cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.field_permissions cascade;
drop table if exists public.field_definitions cascade;
drop table if exists public.equipment cascade;
drop table if exists public.locations cascade;
drop table if exists public.user_profiles cascade;
commit;

-- =============================================================================
-- 001_tables.sql  —  Spec v0.9 mục 6
-- =============================================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_locations_updated_at on public.locations;
create trigger trg_locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create table if not exists public.user_profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text not null,
  email                text not null,
  employee_id          text,
  department           text,
  role                 text not null default 'viewer'
                       check (role in ('admin','user','viewer')),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,

  can_create           boolean not null default false,
  can_move             boolean not null default false,
  can_detach           boolean not null default false,
  can_archive          boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists idx_user_profiles_email
  on public.user_profiles (lower(email));

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.equipment (
  id                  uuid primary key default gen_random_uuid(),

  jabil_id            text,
  part_number         text,
  serial_number       text not null,
  asset               text,
  types               text,
  level               text,
  status              text,
  current_location_id uuid not null references public.locations(id),
  remark              text,
  parent_id           uuid references public.equipment(id) on delete restrict,

  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id),
  archived_at         timestamptz,
  archived_by         uuid references auth.users(id),

  serial_sort text generated always as (
    lpad(coalesce(nullif(regexp_replace(serial_number, '\D', '', 'g'), ''), '0'), 20, '0')
    || '|' || serial_number
  ) stored,

  constraint equipment_no_self_parent check (id <> parent_id)
);

drop trigger if exists trg_equipment_updated_at on public.equipment;
create trigger trg_equipment_updated_at
  before update on public.equipment
  for each row execute function public.set_updated_at();

create table if not exists public.field_definitions (
  id               uuid primary key default gen_random_uuid(),
  field_key        text not null unique,
  display_label    text not null,
  data_type        text not null check (data_type in ('text','number','date')),
  input_type       text not null check (input_type in
                     ('text','textarea','number','date','dropdown','location_ref')),
  is_required      boolean not null default false,
  dropdown_options jsonb,
  is_visible       boolean not null default true,
  display_order    integer not null,
  max_length       integer,
  help_text        text,
  placeholder      text,
  is_system        boolean not null default false,
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_field_definitions_updated_at on public.field_definitions;
create trigger trg_field_definitions_updated_at
  before update on public.field_definitions
  for each row execute function public.set_updated_at();

create table if not exists public.field_permissions (
  user_id    uuid references auth.users(id) on delete cascade,
  field_key  text references public.field_definitions(field_key) on delete cascade,
  can_edit   boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, field_key)
);

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in
                ('equipment','user','field','location')),
  entity_id   uuid,
  action      text not null,
  changes     jsonb not null default '{}'::jsonb,
  changed_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  request_id  text,
  source      text not null default 'ui' check (source in ('ui','migration','script')),
  note        text
);

create table if not exists public.error_log (
  id         uuid primary key default gen_random_uuid(),
  request_id text not null,
  route      text,
  user_id    uuid,
  error_code text,
  message    text,
  stack      text,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 002_indexes.sql  —  Spec v0.9 mục 45
-- =============================================================================

create index if not exists idx_equipment_serial_number on public.equipment (serial_number);
create index if not exists idx_equipment_part_number   on public.equipment (part_number);
create index if not exists idx_equipment_asset         on public.equipment (asset);
create index if not exists idx_equipment_parent_id     on public.equipment (parent_id);
create index if not exists idx_equipment_archived_at   on public.equipment (archived_at);

create index if not exists idx_equipment_location_id
  on public.equipment (current_location_id) where archived_at is null;
create index if not exists idx_equipment_status
  on public.equipment (status) where archived_at is null;
create index if not exists idx_equipment_types
  on public.equipment (types) where archived_at is null;

create index if not exists idx_audit_equipment
  on public.audit_log (entity_id, created_at desc) where entity_type = 'equipment';
create index if not exists idx_audit_recent
  on public.audit_log (created_at desc);

create index if not exists idx_error_log_request on public.error_log (request_id);
create index if not exists idx_error_log_recent  on public.error_log (created_at desc);

create index if not exists idx_locations_sort on public.locations (sort_order, code);

-- =============================================================================
-- 003_rls_lockdown.sql  —  Spec v0.9 mục 3c
-- =============================================================================

alter table public.locations         enable row level security;
alter table public.user_profiles     enable row level security;
alter table public.equipment         enable row level security;
alter table public.field_definitions enable row level security;
alter table public.field_permissions enable row level security;
alter table public.audit_log         enable row level security;
alter table public.error_log         enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

revoke update, delete on public.audit_log from public;

-- =============================================================================
-- 004_functions.sql  —  Spec v0.9 mục 34, 45
-- =============================================================================

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
       and e.archived_at is null
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

  -- Only record a field when it actually changed — a detach deliberately
  -- keeps the same location (mục 22), so logging an unchanged "old → new"
  -- pair there made the History tab look like the location had moved when
  -- it hadn't.
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

create or replace function public.get_equipment_ancestors(p_id uuid)
returns table (
  id uuid, serial_number text, part_number text, jabil_id text, asset text,
  types text, level text, status text, current_location_id uuid,
  parent_id uuid, archived_at timestamptz, depth int)
language plpgsql stable as $$
begin
  perform public.internal_ancestor_ids(p_id);

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
  perform public.internal_subtree_ids(p_id);

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
    v_loc := v_parent.current_location_id;
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

-- =============================================================================
-- 005_usernames.sql
-- =============================================================================
begin;

alter table public.user_profiles add column if not exists username text;

update public.user_profiles
set username = lower(split_part(email, '@', 1))
where username is null;

do $$
begin
  if exists (
    select 1 from public.user_profiles
    where username is null or username !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
  ) then
    raise exception 'USERNAME_BACKFILL_INVALID: Assign valid lowercase usernames before retrying migration 005.';
  end if;
  if exists (
    select lower(username) from public.user_profiles
    group by lower(username) having count(*) > 1
  ) then
    raise exception 'USERNAME_BACKFILL_DUPLICATE: Email prefixes overlap. Assign distinct usernames before retrying migration 005.';
  end if;
end
$$;

alter table public.user_profiles alter column username set not null;
alter table public.user_profiles drop constraint if exists user_profiles_username_format;
alter table public.user_profiles add constraint user_profiles_username_format
  check (username ~ '^[a-z0-9][a-z0-9._+-]{0,63}$');
create unique index if not exists uq_user_profiles_username
  on public.user_profiles (lower(username));

comment on column public.user_profiles.username is
  'Independent login name, stored lowercase. Email remains the Supabase Auth identity.';
notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- 006_local_auth.sql
-- =============================================================================
begin;

alter table public.user_profiles drop constraint if exists user_profiles_id_fkey;
alter table public.user_profiles alter column id set default gen_random_uuid();
alter table public.user_profiles alter column email drop not null;

alter table public.user_profiles
  add column if not exists auth_provider text not null default 'supabase'
    check (auth_provider in ('supabase','local')),
  add column if not exists password_hash text,
  add column if not exists token_version integer not null default 1;

alter table public.user_profiles drop constraint if exists user_profiles_local_password_chk;
alter table public.user_profiles add constraint user_profiles_local_password_chk
  check (
    (auth_provider = 'local'    and password_hash is not null) or
    (auth_provider = 'supabase' and password_hash is null)
  );

alter table public.equipment drop constraint if exists equipment_created_by_fkey;
alter table public.equipment add constraint equipment_created_by_fkey
  foreign key (created_by) references public.user_profiles(id);
alter table public.equipment drop constraint if exists equipment_updated_by_fkey;
alter table public.equipment add constraint equipment_updated_by_fkey
  foreign key (updated_by) references public.user_profiles(id);
alter table public.equipment drop constraint if exists equipment_archived_by_fkey;
alter table public.equipment add constraint equipment_archived_by_fkey
  foreign key (archived_by) references public.user_profiles(id);

alter table public.field_definitions drop constraint if exists field_definitions_updated_by_fkey;
alter table public.field_definitions add constraint field_definitions_updated_by_fkey
  foreign key (updated_by) references public.user_profiles(id);

alter table public.field_permissions drop constraint if exists field_permissions_user_id_fkey;
alter table public.field_permissions add constraint field_permissions_user_id_fkey
  foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.field_permissions drop constraint if exists field_permissions_updated_by_fkey;
alter table public.field_permissions add constraint field_permissions_updated_by_fkey
  foreign key (updated_by) references public.user_profiles(id);

alter table public.audit_log drop constraint if exists audit_log_changed_by_fkey;
alter table public.audit_log add constraint audit_log_changed_by_fkey
  foreign key (changed_by) references public.user_profiles(id);

comment on column public.user_profiles.auth_provider is
  'supabase = real Supabase Auth account (email + password via Supabase; used for admins). local = username + password stored in password_hash, verified by the app, session via a signed cookie — no auth.users row.';
comment on column public.user_profiles.password_hash is
  'Format "scrypt:<saltHex>:<hashHex>" (see lib/auth/password.ts). Only set when auth_provider = local; Supabase manages its own password storage for auth_provider = supabase.';
comment on column public.user_profiles.token_version is
  'Bumped whenever a local account''s password changes, to invalidate existing local-session cookies (lib/auth/localSession.ts). Not used for auth_provider = supabase.';

notify pgrst, 'reload schema';
commit;

-- =============================================================================
-- DONE. Next steps (not included here — do these after this script succeeds):
--   1. Dashboard → Authentication → Users → delete any leftover accounts.
--   2. Edit database/seed/001_seed.sql with your real locations/dropdown
--      values, then paste and run it.
--   3. npx tsx scripts/seed-first-admin.ts you@company.com "Your Name" your.username
-- =============================================================================
