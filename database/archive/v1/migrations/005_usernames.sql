-- Add independent usernames; run once in Supabase SQL Editor before deploying the app.
-- Email stays in place for Supabase Auth. Existing passwords and roles are unchanged.
begin;

alter table public.user_profiles add column if not exists username text;

-- Keep any explicitly assigned usernames when this migration is re-run.
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
