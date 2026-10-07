-- =============================================================================
-- 06_equipment_usage.sql — thêm cột Usage (In use / Not in use) cho thiết bị đã dựng.
--
-- Database dựng từ 02_schema.sql mới đã có cột này: không cần chạy file này.
--
-- Thứ tự: chạy file này, RỒI chạy lại 04_functions.sql (hàm Check-out / Check-in
-- equipment_set_usage, chặn Xóa / Đổi vị trí / Đổi cha khi In use, Swap đổi Usage).
-- Chạy lại nhiều lần được. Thiết bị đang có mặc định là Not in use.
-- =============================================================================
begin;

alter table public.equipments add column if not exists usage text not null default 'not_in_use';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipments_usage_check') then
    alter table public.equipments
      add constraint equipments_usage_check check (usage in ('in_use', 'not_in_use'));
  end if;
end
$$;

create index if not exists equipments_usage_idx on public.equipments (usage);

-- Lịch sử thiết bị nhận thêm hành động CHECK_OUT / CHECK_IN.
alter table public.equipment_histories drop constraint if exists equipment_histories_action_check;
alter table public.equipment_histories add constraint equipment_histories_action_check check (action in (
  'CREATE', 'UPDATE', 'CHANGE_LOCATION', 'MOVE', 'SWAP', 'DETACH', 'CHECK_OUT', 'CHECK_IN', 'DELETE'));

comment on column public.equipments.usage is
  'Đang dùng (in_use) / không dùng (not_in_use) — đổi bằng Check-out / Check-in và đổi theo chỗ khi Swap; không phải Status.';

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: phải ra 1 dòng — usage, text, NO, 'not_in_use'::text.
-- -----------------------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'equipments' and column_name = 'usage';
