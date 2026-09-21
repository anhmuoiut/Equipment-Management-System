-- =============================================================================
-- 001_tables.sql  —  Spec v0.9 mục 6
-- =============================================================================
-- Chạy trên Supabase SQL Editor hoặc `supabase db push`.
-- auth.users do Supabase cung cấp sẵn.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- updated_at trigger  (mục 6.8)
-- CHỈ set updated_at. version bump tường minh trong RPC — không bao giờ ở trigger.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- locations  (mục 6.1)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- user_profiles  (mục 6.3)
-- Nơi lưu role + action permission. Được query ở MỌI request.
-- -----------------------------------------------------------------------------
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

  -- action permission (mục 32)
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

-- -----------------------------------------------------------------------------
-- equipment  (mục 6.2)
-- -----------------------------------------------------------------------------
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

  -- natural sort key: "989" phải đứng trước "1089" (mục 18)
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

-- -----------------------------------------------------------------------------
-- field_definitions  (mục 6.4)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- field_permissions  (mục 6.5)
-- V1 chỉ ghi qua preset. Schema giữ nguyên để v1.1 thêm UI per-cell không migrate.
-- -----------------------------------------------------------------------------
create table if not exists public.field_permissions (
  user_id    uuid references auth.users(id) on delete cascade,
  field_key  text references public.field_definitions(field_key) on delete cascade,
  can_edit   boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, field_key)
);

-- -----------------------------------------------------------------------------
-- audit_log  (mục 6.6) — append-only
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- error_log  (mục 6.7)
-- Log Vercel Hobby chỉ giữ ~1 giờ — đây là nơi điều tra lỗi user báo lại sau.
-- -----------------------------------------------------------------------------
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
