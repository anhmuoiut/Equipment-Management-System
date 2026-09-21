-- Chỉ dùng cho test local (Docker/Postgres trần). KHÔNG chạy trên Supabase.
-- Giả lập những thứ Supabase cung cấp sẵn: schema auth, bảng auth.users, các role.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
grant usage on schema public to anon, authenticated, service_role;
