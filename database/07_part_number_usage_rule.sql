-- =============================================================================
-- 07_part_number_usage_rule.sql — cờ "chỉ In use khi có cha" cho Part Number (database đã dựng).
--
-- Database dựng từ 02_schema.sql mới đã có cột này: không cần chạy file này.
--
-- Thứ tự: chạy file này (sau 06_equipment_usage.sql), RỒI chạy lại 04_functions.sql
-- (trigger chặn In use khi chưa có cha; Tách khỏi cha → Not in use; Gắn vào cha → theo cha).
-- Chạy lại nhiều lần được. Mọi part number mặc định không cần cha (false).
-- =============================================================================
begin;

alter table public.part_numbers add column if not exists usage_needs_parent boolean not null default false;

comment on column public.part_numbers.usage_needs_parent is
  'true: thiết bị mang part number này chỉ In use được khi đã gắn vào thiết bị cha (04_functions.sql mục 3d).';

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: phải ra 1 dòng — usage_needs_parent, boolean, NO, false.
-- -----------------------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'part_numbers' and column_name = 'usage_needs_parent';
