-- =============================================================================
-- 08_equipment_part_type_required.sql — Part Number và Type bắt buộc cho thiết bị (database đã dựng).
--
-- Database dựng từ 02_schema.sql mới đã bắt buộc hai cột này: không cần chạy file này.
--
-- Thứ tự: chạy sau 05 / 06 / 07. Chạy lại nhiều lần được.
-- 1. Thiết bị chưa có part number thì file DỪNG, không đổi gì, và liệt kê các serial đó — gán part
--    number cho chúng (hoặc xóa) rồi chạy lại.
-- 2. Type của mọi thiết bị đặt lại theo part number (Type luôn theo part number); sau đó cả hai
--    cột thành NOT NULL.
-- =============================================================================
begin;

do $$
declare
  v_missing text;
begin
  select string_agg(serial_number, ', ' order by serial_number) into v_missing
  from public.equipments where part_number_id is null;
  if v_missing is not null then
    raise exception 'Thiết bị chưa có part number: %', v_missing;
  end if;
end
$$;

update public.equipments e
set type_id = pn.type_id
from public.part_numbers pn
where pn.id = e.part_number_id and e.type_id is distinct from pn.type_id;

alter table public.equipments alter column part_number_id set not null;
alter table public.equipments alter column type_id set not null;

comment on column public.equipments.type_id is
  'Luôn bằng part_numbers.type_id của part number thiết bị mang (database tự đặt) — không chọn tay.';

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: phải ra 2 dòng, cả hai is_nullable = NO.
-- -----------------------------------------------------------------------------
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'equipments' and column_name in ('part_number_id', 'type_id')
order by column_name;
