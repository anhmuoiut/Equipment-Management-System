-- =============================================================================
-- 003_admin_hardening.sql — paste into Supabase SQL Editor and run once,
-- BEFORE deploying the app version that ships with it (withAuth reads the
-- new sessions_revoked_at column on every request).
--
-- Moves every multi-step admin write into one transaction per action:
--   - admin_create_user / admin_set_user_access: profile + role + permission
--     grants + audit in one go, with old/new values in the audit row, so a
--     failure half-way can no longer strip a user's permissions.
--   - admin_set_user_active: activate/deactivate.
--   - Both refuse to leave the project without an active admin (LAST_ADMIN)
--     and refuse an admin deactivating/demoting themselves
--     (CANNOT_MODIFY_SELF). Admin rows are locked first, so two admins
--     demoting each other at the same moment can't both succeed.
--   - admin_record_password_reset: bookkeeping after an admin password
--     reset — local accounts get the new hash + token_version bump; Supabase
--     accounts get sessions_revoked_at so sessions signed in before the reset
--     stop working (checked in lib/auth/session.ts).
--   - admin_delete_custom_field: strips the key from EVERY equipment row in
--     one statement (the old code read rows through PostgREST, which caps a
--     response at 1000 rows) and keeps the removed values in the audit row.
--   - admin_blocked_creators / admin_grant_field_edit: the Required ×
--     field-permission trap — who holds equipment.create but can't fill a
--     field, and granting them edit permission on it.
-- Also:
--   - drops the 'user.manage' catalog code — nothing ever checked it; user
--     management is deliberately admin-only (app/(app)/admin/layout.tsx).
--   - 90-day retention on error_log.
-- Incremental — does NOT drop or touch any other existing table/data.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------
alter table public.user_profiles add column if not exists sessions_revoked_at timestamptz;
comment on column public.user_profiles.sessions_revoked_at is
  'Supabase-Auth accounts only: a session whose last sign-in is older than this is rejected. Set when an admin resets the password (local accounts use token_version instead).';

-- Nothing ever enforced user.manage (every user-management route is
-- role=admin). Granting it only misled admins into thinking they had
-- delegated something. The FK cascade removes existing grants too.
delete from public.permissions where code = 'user.manage';

-- -----------------------------------------------------------------------------
-- 2. error_log retention — errors are rare, so a statement-level purge on
--    insert (index range scan on created_at) costs nothing and needs no cron.
-- -----------------------------------------------------------------------------
create or replace function public.internal_purge_error_log() returns trigger
language plpgsql as $$
begin
  delete from public.error_log where created_at < now() - interval '90 days';
  return null;
end;
$$;

drop trigger if exists trg_error_log_retention on public.error_log;
create trigger trg_error_log_retention
  after insert on public.error_log
  for each statement execute function public.internal_purge_error_log();

-- -----------------------------------------------------------------------------
-- 3. Shared helpers
-- -----------------------------------------------------------------------------

-- Locks every active admin row so concurrent role/active changes serialize;
-- call before any change that could remove an admin. Ordered by id so two
-- callers always take the locks in the same order (no deadlock).
create or replace function public.internal_lock_admins() returns void
language plpgsql as $$
begin
  perform set_config('lock_timeout', '3s', true);
  perform 1 from public.user_profiles where role = 'admin' and is_active order by id for update;
end;
$$;

create or replace function public.internal_assert_admin_remains() returns void
language plpgsql as $$
begin
  if not exists (select 1 from public.user_profiles where role = 'admin' and is_active) then
    raise exception 'LAST_ADMIN';
  end if;
end;
$$;

-- Replaces a user's permission grants and editable fields with exactly the
-- given lists (unknown codes/keys are ignored). A NULL list leaves that half
-- untouched. Returns old/new of both halves for the caller's audit row.
create or replace function public.internal_apply_user_grants(
  p_actor       uuid,
  p_user        uuid,
  p_permissions text[],
  p_field_keys  text[]
) returns jsonb
language plpgsql as $$
declare
  v_old_perms  text[];
  v_new_perms  text[];
  v_old_fields text[];
  v_new_fields text[];
begin
  select coalesce(array_agg(permission_code order by permission_code), '{}')
    into v_old_perms
    from public.user_permissions where user_id = p_user;

  select coalesce(array_agg(fd.field_key order by fd.field_key), '{}')
    into v_old_fields
    from public.field_permissions fp
    join public.field_definitions fd on fd.id = fp.field_definition_id
   where fp.user_id = p_user and fp.can_edit;

  v_new_perms := v_old_perms;
  v_new_fields := v_old_fields;

  if p_permissions is not null then
    select coalesce(array_agg(code order by code), '{}')
      into v_new_perms
      from public.permissions where code = any(p_permissions);

    delete from public.user_permissions
     where user_id = p_user and permission_code <> all(v_new_perms);
    insert into public.user_permissions (user_id, permission_code, granted_by)
    select p_user, c, p_actor from unnest(v_new_perms) as c
    on conflict (user_id, permission_code) do nothing;
  end if;

  if p_field_keys is not null then
    select coalesce(array_agg(field_key order by field_key), '{}')
      into v_new_fields
      from public.field_definitions where field_key = any(p_field_keys);

    delete from public.field_permissions fp
     using public.field_definitions fd
     where fp.user_id = p_user
       and fd.id = fp.field_definition_id
       and (fd.field_key <> all(v_new_fields) or not fp.can_edit);
    insert into public.field_permissions (user_id, field_definition_id, can_edit, updated_by)
    select p_user, fd.id, true, p_actor
      from public.field_definitions fd
     where fd.field_key = any(v_new_fields)
    on conflict (user_id, field_definition_id)
      do update set can_edit = true, updated_by = excluded.updated_by, updated_at = now();
  end if;

  return jsonb_build_object(
    'old_permissions', to_jsonb(v_old_perms), 'new_permissions', to_jsonb(v_new_perms),
    'old_fields', to_jsonb(v_old_fields), 'new_fields', to_jsonb(v_new_fields));
end;
$$;

-- Required fields a role='user' account holding equipment.create could not
-- fill: creating equipment requires every Required field, and assertFields
-- rejects any field the account can't edit — so each one listed here means
-- "this account cannot create equipment at all".
create or replace function public.internal_blocking_required_fields(
  p_role        text,
  p_permissions text[],
  p_field_keys  text[]
) returns text[]
language sql stable as $$
  select case
    when p_role <> 'user' or not ('equipment.create' = any(coalesce(p_permissions, '{}'))) then '{}'::text[]
    else coalesce((
      select array_agg(display_label order by display_order)
        from public.field_definitions
       where is_required and field_key <> all(coalesce(p_field_keys, '{}'))
    ), '{}')
  end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Users
-- -----------------------------------------------------------------------------

-- The profile half of creating a Supabase-Auth account. The auth.users row
-- is created first by the app (Auth admin API, outside any SQL
-- transaction); if this fails the app deletes that auth user again.
create or replace function public.admin_create_user(
  p_actor         uuid,
  p_id            uuid,
  p_full_name     text,
  p_username      text,
  p_email         text,
  p_employee_id   text,
  p_department_id uuid,
  p_role          text,
  p_permissions   text[],
  p_field_keys    text[],
  p_request_id    text
) returns jsonb
language plpgsql as $$
declare
  v_grants jsonb;
  v_perms  text[];
  v_fields text[];
begin
  if p_role not in ('admin', 'user', 'viewer') then raise exception 'VALIDATION_ERROR'; end if;

  insert into public.user_profiles
        (id, full_name, username, email, employee_id, department_id, role,
         is_active, must_change_password, auth_provider)
  values (p_id, p_full_name, p_username, p_email, p_employee_id, p_department_id, p_role,
          true, true, 'supabase');

  -- Grants are only meaningful for role='user' (admin bypasses every check,
  -- viewer is view-only regardless).
  v_grants := public.internal_apply_user_grants(
    p_actor, p_id,
    case when p_role = 'user' then coalesce(p_permissions, '{}') else '{}'::text[] end,
    case when p_role = 'user' then coalesce(p_field_keys, '{}') else '{}'::text[] end);
  v_perms  := array(select jsonb_array_elements_text(v_grants->'new_permissions'));
  v_fields := array(select jsonb_array_elements_text(v_grants->'new_fields'));

  insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('user', p_id, 'USER_CREATE',
          jsonb_build_object(
            'username',        jsonb_build_object('old', null, 'new', p_username),
            'role',            jsonb_build_object('old', null, 'new', p_role),
            'permissions',     jsonb_build_object('old', null, 'new', v_grants->'new_permissions'),
            'editable_fields', jsonb_build_object('old', null, 'new', v_grants->'new_fields')),
          p_actor, p_request_id);

  return jsonb_build_object(
    'user_id', p_id,
    'blocking_required_fields', to_jsonb(public.internal_blocking_required_fields(p_role, v_perms, v_fields)));
end;
$$;

-- Role + permission grants + editable fields in one transaction. NULL
-- p_role / p_permissions / p_field_keys keep that part as-is. Grants are
-- only replaced for role='user'; for admin/viewer they are kept untouched
-- (they have no effect there) so switching back to 'user' restores them.
create or replace function public.admin_set_user_access(
  p_actor       uuid,
  p_user        uuid,
  p_role        text,
  p_permissions text[],
  p_field_keys  text[],
  p_request_id  text
) returns jsonb
language plpgsql as $$
declare
  v_before  public.user_profiles%rowtype;
  v_role    text;
  v_grants  jsonb;
  v_perms   text[];
  v_fields  text[];
  v_changes jsonb := '{}'::jsonb;
begin
  if p_role is not null and p_role not in ('admin', 'user', 'viewer') then raise exception 'VALIDATION_ERROR'; end if;

  perform public.internal_lock_admins();
  select * into v_before from public.user_profiles where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  v_role := coalesce(p_role, v_before.role);
  if p_user = p_actor and v_role <> v_before.role then raise exception 'CANNOT_MODIFY_SELF'; end if;

  if v_role <> v_before.role then
    update public.user_profiles set role = v_role where id = p_user;
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_before.role, 'new', v_role));
  end if;

  v_grants := public.internal_apply_user_grants(
    p_actor, p_user,
    case when v_role = 'user' then p_permissions end,
    case when v_role = 'user' then p_field_keys end);
  v_perms  := array(select jsonb_array_elements_text(v_grants->'new_permissions'));
  v_fields := array(select jsonb_array_elements_text(v_grants->'new_fields'));

  if v_grants->'old_permissions' <> v_grants->'new_permissions' then
    v_changes := v_changes || jsonb_build_object('permissions',
      jsonb_build_object('old', v_grants->'old_permissions', 'new', v_grants->'new_permissions'));
  end if;
  if v_grants->'old_fields' <> v_grants->'new_fields' then
    v_changes := v_changes || jsonb_build_object('editable_fields',
      jsonb_build_object('old', v_grants->'old_fields', 'new', v_grants->'new_fields'));
  end if;

  perform public.internal_assert_admin_remains();

  if v_changes <> '{}'::jsonb then
    insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
    values ('user', p_user,
            case when v_changes ? 'role' then 'USER_ROLE_CHANGE' else 'USER_PERMISSION_UPDATE' end,
            v_changes, p_actor, p_request_id);
  end if;

  return jsonb_build_object(
    'user_id', p_user,
    'role', v_role,
    'permissions', to_jsonb(v_perms),
    'editable_fields', to_jsonb(v_fields),
    'blocking_required_fields', to_jsonb(public.internal_blocking_required_fields(v_role, v_perms, v_fields)));
end;
$$;

create or replace function public.admin_set_user_active(
  p_actor      uuid,
  p_user       uuid,
  p_active     boolean,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_before public.user_profiles%rowtype;
begin
  perform public.internal_lock_admins();
  select * into v_before from public.user_profiles where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p_user = p_actor and not p_active then raise exception 'CANNOT_MODIFY_SELF'; end if;

  if v_before.is_active is distinct from p_active then
    update public.user_profiles set is_active = p_active where id = p_user;
    perform public.internal_assert_admin_remains();

    insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
    values ('user', p_user, case when p_active then 'USER_REACTIVATE' else 'USER_DEACTIVATE' end,
            jsonb_build_object('is_active', jsonb_build_object('old', v_before.is_active, 'new', p_active)),
            p_actor, p_request_id);
  end if;

  return jsonb_build_object('id', p_user, 'is_active', p_active);
end;
$$;

-- After an admin sets someone else's password. Local accounts: stores the
-- new hash (hashed by the app) and bumps token_version, which invalidates
-- every cookie signed before. Supabase accounts: the app has already
-- updated the password through the Auth admin API; sessions_revoked_at
-- makes sessions signed in before now stop working.
create or replace function public.admin_record_password_reset(
  p_actor         uuid,
  p_user          uuid,
  p_password_hash text,
  p_request_id    text
) returns jsonb
language plpgsql as $$
declare
  v_before public.user_profiles%rowtype;
begin
  select * into v_before from public.user_profiles where id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p_user = p_actor then raise exception 'CANNOT_MODIFY_SELF'; end if;

  if v_before.auth_provider = 'local' then
    if p_password_hash is null then raise exception 'VALIDATION_ERROR'; end if;
    update public.user_profiles
       set password_hash = p_password_hash,
           token_version = token_version + 1,
           must_change_password = true
     where id = p_user;
  else
    update public.user_profiles
       set sessions_revoked_at = now(),
           must_change_password = true
     where id = p_user;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('user', p_user, 'USER_PASSWORD_RESET',
          jsonb_build_object('password_changed', jsonb_build_object('old', null, 'new', true)),
          p_actor, p_request_id);

  return jsonb_build_object('user_id', p_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Custom fields
-- -----------------------------------------------------------------------------

-- Deletes a custom field and strips its key from every equipment row, in
-- one transaction. The removed values are kept in the audit row, the only
-- place they could be recovered from afterwards. Bumps each touched row's
-- version so an edit form opened before the delete gets OPTIMISTIC_CONFLICT
-- instead of silently writing against a stale row.
create or replace function public.admin_delete_custom_field(
  p_actor      uuid,
  p_field_key  text,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_def     public.field_definitions%rowtype;
  v_removed jsonb;
  v_count   integer;
begin
  perform set_config('lock_timeout', '3s', true);

  select * into v_def from public.field_definitions where field_key = p_field_key for update;
  if not found then raise exception 'VALIDATION_ERROR'; end if;
  if v_def.is_system then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_object_agg(id::text, custom_fields -> p_field_key), '{}'::jsonb), count(*)
    into v_removed, v_count
    from public.equipment
   where custom_fields ? p_field_key;

  update public.equipment
     set custom_fields = custom_fields - p_field_key,
         version = version + 1
   where custom_fields ? p_field_key;

  -- field_options and field_permissions go with it (on delete cascade).
  delete from public.field_definitions where id = v_def.id;

  insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
  values ('field', v_def.id, 'FIELD_DELETE',
          jsonb_build_object(
            'field_key',      jsonb_build_object('old', p_field_key, 'new', null),
            'removed_values', jsonb_build_object('old', v_removed, 'new', null)),
          p_actor, p_request_id);

  return jsonb_build_object('field_key', p_field_key, 'cleared_records', v_count);
end;
$$;

-- Active role='user' accounts holding equipment.create that cannot edit the
-- field. Only meaningful while the field is Required (see
-- internal_blocking_required_fields) — the caller decides whether to show it.
create or replace function public.admin_blocked_creators(p_field_key text)
returns table (id uuid, full_name text, username text)
language sql stable as $$
  select u.id, u.full_name, u.username
    from public.user_profiles u
    join public.user_permissions up
      on up.user_id = u.id and up.permission_code = 'equipment.create'
   where u.role = 'user'
     and u.is_active
     and not exists (
       select 1
         from public.field_permissions fp
         join public.field_definitions fd on fd.id = fp.field_definition_id
        where fp.user_id = u.id and fp.can_edit and fd.field_key = p_field_key)
   order by u.full_name;
$$;

-- Grants edit permission on one field to every account admin_blocked_creators
-- lists. Admin-only at the API layer: it changes other users' permissions.
create or replace function public.admin_grant_field_edit(
  p_actor      uuid,
  p_field_key  text,
  p_request_id text
) returns jsonb
language plpgsql as $$
declare
  v_def   public.field_definitions%rowtype;
  v_users uuid[];
begin
  select * into v_def from public.field_definitions where field_key = p_field_key;
  if not found then raise exception 'VALIDATION_ERROR'; end if;

  select coalesce(array_agg(b.id), '{}') into v_users
    from public.admin_blocked_creators(p_field_key) b;

  insert into public.field_permissions (user_id, field_definition_id, can_edit, updated_by)
  select u, v_def.id, true, p_actor from unnest(v_users) as u
  on conflict (user_id, field_definition_id)
    do update set can_edit = true, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_log (entity_type, entity_id, action, changes, changed_by, request_id)
  select 'user', u, 'USER_PERMISSION_UPDATE',
         jsonb_build_object('field_granted', jsonb_build_object('old', null, 'new', p_field_key)),
         p_actor, p_request_id
    from unnest(v_users) as u;

  return jsonb_build_object('field_key', p_field_key, 'granted_users', coalesce(array_length(v_users, 1), 0));
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants — same lockdown as full_reset.sql section 12.
-- -----------------------------------------------------------------------------
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
         'internal_purge_error_log', 'internal_lock_admins', 'internal_assert_admin_remains',
         'internal_apply_user_grants', 'internal_blocking_required_fields',
         'admin_create_user', 'admin_set_user_access', 'admin_set_user_active',
         'admin_record_password_reset', 'admin_delete_custom_field',
         'admin_blocked_creators', 'admin_grant_field_edit')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end;
$$;

commit;

-- Supabase normally picks up new functions on its own; this makes sure the
-- API (PostgREST) sees them before the new app version calls them.
notify pgrst, 'reload schema';

-- =============================================================================
-- DONE. Deploy the matching app version next.
-- =============================================================================
