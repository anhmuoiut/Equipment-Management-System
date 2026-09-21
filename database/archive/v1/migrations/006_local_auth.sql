-- =============================================================================
-- 006_local_auth.sql  —  adds self-service local accounts
-- =============================================================================
-- Run once, after 001–005, in Supabase SQL Editor.
--
-- Until now every account lived in Supabase Auth (auth.users) and every
-- "who did this" column pointed at it. This migration adds a second kind of
-- account — auth_provider = 'local' — whose username + password are verified
-- by the app itself (see lib/auth/password.ts, lib/auth/localSession.ts) and
-- who never gets a row in auth.users at all. Admin accounts keep using real
-- Supabase Auth (auth_provider = 'supabase', unchanged).
--
-- Because local accounts have no auth.users row, user_profiles.id can no
-- longer be FK'd to auth.users, and every other table that recorded "who did
-- this" via a uuid FK'd to auth.users must point at user_profiles instead —
-- user_profiles.id is still the same uuid for 'supabase' rows (it's set to
-- the Supabase Auth user's id at creation time, same as before), so nothing
-- downstream needs to change except the FK target.
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
