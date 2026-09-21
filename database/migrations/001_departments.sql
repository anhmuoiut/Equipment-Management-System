-- =============================================================================
-- 001_departments.sql — paste into Supabase SQL Editor and run once.
-- Adds Department as admin-managed master data (same shape/pattern as
-- Equipment Types/Statuses/Levels — see database/full_reset.sql section 4),
-- replacing user_profiles.department's free-text column with a
-- department_id reference, so "Test Engineering" / "Test Eng" / "TestEng"
-- can no longer coexist as separate values for the same department.
-- Incremental — does NOT drop or touch any other existing table/data.
-- =============================================================================
begin;

create table public.departments (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  display_name  text not null,
  description   text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_by    uuid references public.user_profiles(id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references public.user_profiles(id),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create index idx_departments_sort on public.departments (display_order, code);

-- Same RLS shape as every other table (section 11 of full_reset.sql):
-- deny-all, service_role bypasses RLS and is the only role granted access.
alter table public.departments enable row level security;
revoke all on public.departments from anon, authenticated;
grant all on public.departments to service_role;
grant usage, select on all sequences in schema public to service_role;

-- user_profiles.department (free text) -> department_id (reference).
-- Safe to drop outright rather than migrate-in-place: at the time of this
-- migration only the seed admin account exists and its department is null.
-- If real free-text department values exist in your database by the time
-- you run this, back them up first (they will be lost).
alter table public.user_profiles add column department_id uuid references public.departments(id);
alter table public.user_profiles drop column department;

-- audit_log.entity_type's check constraint enumerates every valid entity —
-- 'department' needs to join the same list 'equipment_type' etc. are in
-- (constraint name is Postgres's default for an unnamed inline column
-- check: <table>_<column>_check).
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log add constraint audit_log_entity_type_check check (entity_type in
  ('equipment','user','field','location',
   'equipment_type','equipment_status','equipment_level','department',
   'repair','calibration','permission'));

commit;

-- =============================================================================
-- DONE. Next: Admin -> Master Data -> Departments to add your real
-- department list (each user then picks one from that list instead of
-- free-typing it in Account settings / Admin -> Users -> Create user).
-- =============================================================================
