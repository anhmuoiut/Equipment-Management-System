-- =============================================================================
-- 05_part_number_type.sql — thêm Type cho Part Number vào database ĐÃ dựng.
--
-- Database dựng từ 02_schema.sql mới đã có cột này: không cần chạy file này.
--
-- Thứ tự: chạy file này, RỒI chạy lại 04_functions.sql (thêm 2 trigger: thiết
-- bị luôn mang Type của part number; admin đổi Type của part number → mọi
-- thiết bị của part number đổi theo). Chạy lại nhiều lần được.
--
-- Type bắt buộc (not null). Đã có part number thì file dừng, không đổi gì, và
-- báo các part number đó — xóa chúng, hoặc chạy lại 01 → 02 → 04.
-- =============================================================================
begin;

do $$
declare
  v_existing text;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'part_numbers' and column_name = 'type_id') then
    return;
  end if;
  select string_agg(display_name, ', ' order by display_name) into v_existing from public.part_numbers;
  if v_existing is not null then
    raise exception 'Đã có part number chưa gắn Type: %', v_existing;
  end if;
  alter table public.part_numbers add column type_id uuid not null references public.types (id);
  create index part_numbers_type_idx on public.part_numbers (type_id);
  comment on column public.part_numbers.type_id is
    'Loại của mọi thiết bị mang part number này — database tự đặt equipments.type_id theo.';
  comment on column public.equipments.type_id is
    'Có part number → luôn bằng part_numbers.type_id (database tự đặt); không có part number → chọn tay.';
end
$$;

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: phải ra 1 dòng — type_id, uuid, NO (không được trống).
-- -----------------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'part_numbers' and column_name = 'type_id';
