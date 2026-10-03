-- =============================================================================
-- 02_schema.sql — TẠO database v2 theo docs/DATABASE_MODIFIED.md.
--
-- Chạy sau 01_reset_blank.sql, trong Supabase SQL Editor: dán cả file → Run.
-- Cả file chạy trong một giao dịch: lỗi ở đâu thì không tạo gì cả.
--
-- File này chỉ tạo bảng, ràng buộc, index, trigger toàn vẹn dữ liệu và view.
-- Nghiệp vụ nhiều bước (ghi lịch sử, đổi vị trí cả cây, Move / Swap / Detach,
-- tự tính due_date…) thêm sau trong 04_functions.sql khi code từng module.
--
-- Thứ tự: 0 hàm dùng chung · 1 User Management · 2 Configuration ·
--         3 Equipment · 4 Calibration · 5 Golden sample · 6 Hệ thống ·
--         7 Dashboard (view) · 8 Bảo mật
-- =============================================================================

begin;

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- =============================================================================
-- 0. HÀM DÙNG CHUNG
-- =============================================================================

-- Tự cập nhật updated_at mỗi khi sửa dòng.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Bảng lịch sử chỉ được thêm, không sửa / xóa.
create function public.prevent_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'HISTORY_IS_APPEND_ONLY'
    using detail = format('Rows in %I cannot be updated or deleted', tg_table_name);
end;
$$;

-- Trang nào chỉ được chọn trạng thái có tên trang đó trong statuses.applies_to.
-- Tham số trigger: 'equipment' / 'calibration' / 'golden_sample'.
create function public.check_status_applies_to() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status_id is not null and not exists (
    select 1 from public.statuses s
    where s.id = new.status_id and tg_argv[0] = any (s.applies_to)
  ) then
    raise exception 'STATUS_NOT_ALLOWED'
      using detail = format('Status %s is not enabled for %s', new.status_id, tg_argv[0]);
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 1. USER MANAGEMENT
-- =============================================================================

-- user_profiles — tài khoản ---------------------------------------------------
create table public.user_profiles (
  id                   uuid primary key default gen_random_uuid(),
  username             text not null,
  full_name            text not null,
  email                text,
  employee_id          text,
  department_id        uuid,  -- FK departments: thêm ở mục 2 (departments tạo sau)
  role                 text not null default 'readonly',
  account_status       text not null default 'pending',
  approved_by          uuid references public.user_profiles (id),
  approved_at          timestamptz,
  auth_provider        text not null default 'supabase',
  password_hash        text,
  must_change_password boolean not null default true,
  token_version        integer not null default 1,
  sessions_revoked_at  timestamptz,
  created_by           uuid references public.user_profiles (id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references public.user_profiles (id),
  updated_at           timestamptz not null default now(),

  constraint user_profiles_username_format check (username ~ '^[a-z0-9][a-z0-9._+-]{0,63}$'),
  constraint user_profiles_role_check check (role in ('admin', 'user', 'readonly')),
  constraint user_profiles_account_status_check
    check (account_status in ('pending', 'active', 'rejected', 'disabled')),
  constraint user_profiles_auth_provider_check check (auth_provider in ('supabase', 'local')),
  constraint user_profiles_password_check check (
    (auth_provider = 'local'    and password_hash is not null) or
    (auth_provider = 'supabase' and password_hash is null)
  )
);
create unique index user_profiles_username_key on public.user_profiles (username);
create unique index user_profiles_email_key    on public.user_profiles (lower(email)) where email is not null;
create index user_profiles_account_status_idx  on public.user_profiles (account_status);
create trigger user_profiles_set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

comment on table public.user_profiles is 'Tài khoản. Không xóa, chỉ khóa (account_status = disabled).';
comment on column public.user_profiles.id is 'Tài khoản Supabase: trùng id của Supabase Auth.';
comment on column public.user_profiles.password_hash is 'Chỉ cho auth_provider = local. Dạng "scrypt:<saltHex>:<hashHex>".';
comment on column public.user_profiles.token_version is 'local: tăng khi đổi mật khẩu → đăng xuất mọi phiên.';
comment on column public.user_profiles.sessions_revoked_at is 'supabase: phiên đăng nhập trước thời điểm này bị từ chối.';

-- user_histories — lịch sử tài khoản ------------------------------------------
create table public.user_histories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,  -- cố ý không FK
  label      text not null,
  action     text not null,
  changes    jsonb not null default '{}'::jsonb,
  note       text,
  source     text not null default 'ui',
  created_at timestamptz not null default now(),
  created_by uuid references public.user_profiles (id),

  constraint user_histories_action_check check (action in (
    'REGISTER', 'CREATE', 'APPROVE', 'REJECT', 'UPDATE', 'ROLE_CHANGE', 'DISABLE', 'ENABLE', 'PASSWORD_RESET')),
  constraint user_histories_source_check check (source in ('ui', 'import', 'script'))
);
create index user_histories_object_idx  on public.user_histories (user_id, created_at desc);
create index user_histories_created_idx on public.user_histories (created_at desc);
create trigger user_histories_append_only before update or delete on public.user_histories
  for each row execute function public.prevent_history_change();

-- =============================================================================
-- 2. CONFIGURATION — dữ liệu gốc dùng chung + cấu hình hiệu chuẩn
--    Xóa = ẩn (is_active = false), trừ statuses và calibration_configurations.
-- =============================================================================

-- part_numbers — mã part --------------------------------------------------------
create table public.part_numbers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index part_numbers_display_name_key on public.part_numbers (lower(display_name));
create index part_numbers_sort_idx on public.part_numbers (sort_order, display_name);
create trigger part_numbers_set_updated_at before update on public.part_numbers
  for each row execute function public.set_updated_at();

-- locations — vị trí -------------------------------------------------------------
create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index locations_display_name_key on public.locations (lower(display_name));
create index locations_sort_idx on public.locations (sort_order, display_name);
create trigger locations_set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

-- types — loại -------------------------------------------------------------------
create table public.types (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index types_display_name_key on public.types (lower(display_name));
create index types_sort_idx on public.types (sort_order, display_name);
create trigger types_set_updated_at before update on public.types
  for each row execute function public.set_updated_at();

-- statuses — trạng thái (xóa thật; đang dùng thì không xóa được) ------------------
create table public.statuses (
  id              uuid primary key default gen_random_uuid(),
  display_name    text not null,
  sort_order      integer not null default 0,
  applies_to      text[] not null,
  requires_remark boolean not null default false,
  color           text not null default 'gray',
  created_by      uuid references public.user_profiles (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references public.user_profiles (id),
  updated_at      timestamptz not null default now(),

  constraint statuses_applies_to_check check (
    cardinality(applies_to) >= 1
    and applies_to <@ array['equipment', 'calibration', 'golden_sample']::text[]
  ),
  constraint statuses_color_check check (color in ('green', 'yellow', 'red', 'blue', 'gray'))
);
create unique index statuses_display_name_key on public.statuses (lower(display_name));
create index statuses_sort_idx on public.statuses (sort_order, display_name);
create trigger statuses_set_updated_at before update on public.statuses
  for each row execute function public.set_updated_at();

comment on column public.statuses.applies_to is 'Trang được dùng trạng thái này: equipment / calibration / golden_sample.';
comment on column public.statuses.color is 'Màu hiển thị (5 màu hệ thống): green / yellow / red / blue / gray.';

-- levels — level trên dây chuyền -------------------------------------------------
create table public.levels (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index levels_display_name_key on public.levels (lower(display_name));
create index levels_sort_idx on public.levels (sort_order, display_name);
create trigger levels_set_updated_at before update on public.levels
  for each row execute function public.set_updated_at();

-- departments — phòng ban --------------------------------------------------------
create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index departments_display_name_key on public.departments (lower(display_name));
create index departments_sort_idx on public.departments (sort_order, display_name);
create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

alter table public.user_profiles
  add constraint user_profiles_department_id_fkey
  foreign key (department_id) references public.departments (id);

-- calibration_configurations — chu kỳ hiệu chuẩn theo part number (xóa thật) -----
create table public.calibration_configurations (
  id              uuid primary key default gen_random_uuid(),
  part_number_id  uuid not null references public.part_numbers (id) on delete restrict,
  interval_months integer not null,
  warning_days    integer not null default 30,
  created_by      uuid references public.user_profiles (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references public.user_profiles (id),
  updated_at      timestamptz not null default now(),

  constraint calibration_configurations_part_number_id_key unique (part_number_id),
  constraint calibration_configurations_interval_check check (interval_months > 0),
  constraint calibration_configurations_warning_check check (warning_days > 0)
);
create trigger calibration_configurations_set_updated_at before update on public.calibration_configurations
  for each row execute function public.set_updated_at();

-- calibration_vendors — vendor hiệu chuẩn ----------------------------------------
create table public.calibration_vendors (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.user_profiles (id),
  updated_at   timestamptz not null default now()
);
create unique index calibration_vendors_display_name_key on public.calibration_vendors (lower(display_name));
create index calibration_vendors_sort_idx on public.calibration_vendors (sort_order, display_name);
create trigger calibration_vendors_set_updated_at before update on public.calibration_vendors
  for each row execute function public.set_updated_at();

-- configuration_histories — lịch sử của cả 8 bảng cấu hình ------------------------
create table public.configuration_histories (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  uuid not null,  -- cố ý không FK
  label      text not null,
  action     text not null,
  changes    jsonb not null default '{}'::jsonb,
  note       text,
  source     text not null default 'ui',
  created_at timestamptz not null default now(),
  created_by uuid references public.user_profiles (id),

  constraint configuration_histories_table_name_check check (table_name in (
    'part_numbers', 'locations', 'types', 'statuses', 'levels', 'departments',
    'calibration_configurations', 'calibration_vendors')),
  constraint configuration_histories_action_check check (action in ('CREATE', 'UPDATE', 'DELETE')),
  constraint configuration_histories_source_check check (source in ('ui', 'import', 'script'))
);
create index configuration_histories_object_idx  on public.configuration_histories (record_id, created_at desc);
create index configuration_histories_created_idx on public.configuration_histories (created_at desc);
create trigger configuration_histories_append_only before update or delete on public.configuration_histories
  for each row execute function public.prevent_history_change();

-- =============================================================================
-- 3. EQUIPMENT
-- =============================================================================

-- equipments — thiết bị ------------------------------------------------------------
create table public.equipments (
  id             uuid primary key default gen_random_uuid(),
  jabil_id       text,
  part_number_id uuid references public.part_numbers (id),
  serial_number  text not null,
  asset          text,
  type_id        uuid references public.types (id),
  status_id      uuid references public.statuses (id) on delete restrict,
  level_id       uuid references public.levels (id),
  location_id    uuid not null references public.locations (id),
  remark         text,
  parent_id      uuid references public.equipments (id) on delete cascade,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.user_profiles (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.user_profiles (id),

  constraint equipments_not_own_parent check (id <> parent_id)
);
create index equipments_part_number_idx   on public.equipments (part_number_id);
create index equipments_serial_number_idx on public.equipments (serial_number);
create index equipments_asset_idx         on public.equipments (asset);
create index equipments_type_idx          on public.equipments (type_id);
create index equipments_status_idx        on public.equipments (status_id);
create index equipments_location_idx      on public.equipments (location_id);
create index equipments_parent_idx        on public.equipments (parent_id);
create trigger equipments_set_updated_at before update on public.equipments
  for each row execute function public.set_updated_at();
create trigger equipments_check_status before insert or update of status_id on public.equipments
  for each row execute function public.check_status_applies_to('equipment');

comment on table public.equipments is 'Thiết bị. Xóa thật; xóa cha thì xóa cả cây con.';
comment on column public.equipments.serial_number is 'Không UQ — trùng chỉ cảnh báo.';
comment on column public.equipments.parent_id is 'Thiết bị cha; chỉ đổi qua Move / Swap / Detach.';

-- equipment_histories — lịch sử thiết bị --------------------------------------------
create table public.equipment_histories (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null,  -- cố ý không FK
  label        text not null,
  action       text not null,
  changes      jsonb not null default '{}'::jsonb,
  note         text,
  source       text not null default 'ui',
  created_at   timestamptz not null default now(),
  created_by   uuid references public.user_profiles (id),

  constraint equipment_histories_action_check check (action in (
    'CREATE', 'UPDATE', 'CHANGE_LOCATION', 'MOVE', 'SWAP', 'DETACH', 'DELETE')),
  constraint equipment_histories_source_check check (source in ('ui', 'import', 'script'))
);
create index equipment_histories_object_idx  on public.equipment_histories (equipment_id, created_at desc);
create index equipment_histories_created_idx on public.equipment_histories (created_at desc);
create trigger equipment_histories_append_only before update or delete on public.equipment_histories
  for each row execute function public.prevent_history_change();

-- =============================================================================
-- 4. CALIBRATION — phụ thuộc một chiều vào Equipment
-- =============================================================================

-- calibration_equipments — Dashboard hiệu chuẩn (mỗi thiết bị một dòng) -------------
create table public.calibration_equipments (
  id               uuid primary key default gen_random_uuid(),
  equipment_id     uuid not null references public.equipments (id) on delete cascade,
  status_id        uuid references public.statuses (id) on delete restrict,
  vendor_id        uuid references public.calibration_vendors (id),
  calibration_date date,
  due_date         date,
  remark           text,
  created_by       uuid references public.user_profiles (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.user_profiles (id),
  updated_at       timestamptz not null default now(),

  constraint calibration_equipments_equipment_id_key unique (equipment_id),
  constraint calibration_equipments_due_after_calibration check (due_date >= calibration_date)
);
create index calibration_equipments_status_idx on public.calibration_equipments (status_id);
create index calibration_equipments_due_idx    on public.calibration_equipments (due_date);
create trigger calibration_equipments_set_updated_at before update on public.calibration_equipments
  for each row execute function public.set_updated_at();
create trigger calibration_equipments_check_status before insert or update of status_id on public.calibration_equipments
  for each row execute function public.check_status_applies_to('calibration');

comment on column public.calibration_equipments.due_date is 'Tự tính: calibration_date + interval_months của part number thiết bị.';

-- calibration_histories — lịch sử hiệu chuẩn ----------------------------------------
create table public.calibration_histories (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null,  -- cố ý không FK
  label        text not null,
  action       text not null,
  changes      jsonb not null default '{}'::jsonb,
  note         text,
  source       text not null default 'ui',
  created_at   timestamptz not null default now(),
  created_by   uuid references public.user_profiles (id),

  constraint calibration_histories_action_check check (action in ('ADD', 'REMOVE', 'UPDATE', 'CALIBRATE')),
  constraint calibration_histories_source_check check (source in ('ui', 'import', 'script'))
);
create index calibration_histories_object_idx  on public.calibration_histories (equipment_id, created_at desc);
create index calibration_histories_created_idx on public.calibration_histories (created_at desc);
create trigger calibration_histories_append_only before update or delete on public.calibration_histories
  for each row execute function public.prevent_history_change();

-- =============================================================================
-- 5. GOLDEN SAMPLE
-- =============================================================================

-- golden_samples — golden sample -----------------------------------------------------
create table public.golden_samples (
  id              uuid primary key default gen_random_uuid(),
  part_number     text not null,
  serial_number   text not null,
  location_id     uuid not null references public.locations (id),
  status_id       uuid references public.statuses (id) on delete restrict,
  utd_part_number text,
  origin          text,
  purpose         text,
  remark          text,
  created_by      uuid references public.user_profiles (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references public.user_profiles (id),
  updated_at      timestamptz not null default now()
);
create index golden_samples_part_number_idx   on public.golden_samples (part_number);
create index golden_samples_serial_number_idx on public.golden_samples (serial_number);
create index golden_samples_location_idx      on public.golden_samples (location_id);
create index golden_samples_status_idx        on public.golden_samples (status_id);
create trigger golden_samples_set_updated_at before update on public.golden_samples
  for each row execute function public.set_updated_at();
create trigger golden_samples_check_status before insert or update of status_id on public.golden_samples
  for each row execute function public.check_status_applies_to('golden_sample');

-- golden_sample_histories — lịch sử golden sample -------------------------------------
create table public.golden_sample_histories (
  id               uuid primary key default gen_random_uuid(),
  golden_sample_id uuid not null,  -- cố ý không FK
  label            text not null,
  action           text not null,
  changes          jsonb not null default '{}'::jsonb,
  note             text,
  source           text not null default 'ui',
  created_at       timestamptz not null default now(),
  created_by       uuid references public.user_profiles (id),

  constraint golden_sample_histories_action_check check (action in ('CREATE', 'UPDATE', 'CHANGE_LOCATION', 'DELETE')),
  constraint golden_sample_histories_source_check check (source in ('ui', 'import', 'script'))
);
create index golden_sample_histories_object_idx  on public.golden_sample_histories (golden_sample_id, created_at desc);
create index golden_sample_histories_created_idx on public.golden_sample_histories (created_at desc);
create trigger golden_sample_histories_append_only before update or delete on public.golden_sample_histories
  for each row execute function public.prevent_history_change();

-- =============================================================================
-- Trạng thái: bỏ tích một trang khỏi applies_to bị chặn nếu trang đó đang dùng.
-- (Đặt ở đây vì cần các bảng ở mục 3–5.)
-- =============================================================================
create function public.statuses_guard_applies_to() returns trigger
language plpgsql set search_path = '' as $$
begin
  if 'equipment' = any (old.applies_to) and not ('equipment' = any (new.applies_to))
     and exists (select 1 from public.equipments where status_id = old.id) then
    raise exception 'STATUS_IN_USE' using detail = 'equipment';
  end if;
  if 'calibration' = any (old.applies_to) and not ('calibration' = any (new.applies_to))
     and exists (select 1 from public.calibration_equipments where status_id = old.id) then
    raise exception 'STATUS_IN_USE' using detail = 'calibration';
  end if;
  if 'golden_sample' = any (old.applies_to) and not ('golden_sample' = any (new.applies_to))
     and exists (select 1 from public.golden_samples where status_id = old.id) then
    raise exception 'STATUS_IN_USE' using detail = 'golden_sample';
  end if;
  return new;
end;
$$;
create trigger statuses_guard_applies_to before update of applies_to on public.statuses
  for each row execute function public.statuses_guard_applies_to();

-- =============================================================================
-- 6. HỆ THỐNG
-- =============================================================================

-- notifications — thông báo tài khoản ------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.user_profiles (id) on delete cascade,
  type         text not null,
  title        text not null,
  message      text,
  link         text,
  entity_id    uuid,  -- cố ý không FK
  read_at      timestamptz,
  created_by   uuid references public.user_profiles (id),
  created_at   timestamptz not null default now(),

  constraint notifications_type_check check (type in (
    'USER_APPROVAL_REQUEST', 'USER_APPROVED', 'USER_ROLE_CHANGED', 'USER_PASSWORD_RESET', 'USER_PROFILE_UPDATED'))
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

-- error_log — nhật ký lỗi (tự xóa bản ghi cũ hơn 90 ngày) ----------------------------
create table public.error_log (
  id         uuid primary key default gen_random_uuid(),
  request_id text not null,
  route      text,
  user_id    uuid,  -- cố ý không FK
  error_code text,
  message    text,
  stack      text,
  created_at timestamptz not null default now(),

  constraint error_log_message_length check (char_length(message) <= 2000),
  constraint error_log_stack_length   check (char_length(stack) <= 8000)
);
create index error_log_request_idx on public.error_log (request_id);
create index error_log_created_idx on public.error_log (created_at desc);

create function public.purge_old_error_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.error_log where created_at < now() - interval '90 days';
  return null;
end;
$$;
create trigger error_log_purge after insert on public.error_log
  for each statement execute function public.purge_old_error_log();

-- =============================================================================
-- 7. DASHBOARD — thay đổi gần đây (gộp các bảng lịch sử, không lưu dữ liệu)
--    Dòng của configuration / user chỉ Admin thấy — app lọc theo nhóm quyền.
-- =============================================================================
create view public.recent_activities with (security_invoker = true) as
  select 'equipment'::text     as module, equipment_id     as object_id, label, action, changes, created_by, created_at from public.equipment_histories
  union all
  select 'calibration'::text,             equipment_id,                  label, action, changes, created_by, created_at from public.calibration_histories
  union all
  select 'golden_sample'::text,           golden_sample_id,              label, action, changes, created_by, created_at from public.golden_sample_histories
  union all
  select 'configuration'::text,           record_id,                     label, action, changes, created_by, created_at from public.configuration_histories
  union all
  select 'user'::text,                    user_id,                       label, action, changes, created_by, created_at from public.user_histories;

-- =============================================================================
-- 8. BẢO MẬT — RLS chặn hết; chỉ server (service_role) đọc / ghi
-- =============================================================================
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant  all on all tables    in schema public to service_role;
grant  execute on all functions in schema public to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: phải ra 19 bảng (BASE TABLE) + 1 view (recent_activities).
-- -----------------------------------------------------------------------------
select table_type, table_name
from information_schema.tables
where table_schema = 'public'
order by table_type, table_name;
