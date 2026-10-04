-- =============================================================================
-- 03_seed_sample.sql — DỮ LIỆU MẪU cho Configuration (tùy chọn).
--
-- Chạy sau 02_schema.sql nếu muốn có sẵn vài giá trị để thử. Sửa / thêm / bỏ
-- tùy ý trước khi chạy — sau này admin vẫn sửa được ở Configuration.
-- Chạy lại nhiều lần không bị trùng (bỏ qua giá trị đã có).
-- =============================================================================

begin;

insert into public.types (display_name, sort_order) values
  ('Tester',    1),
  ('Base',      2),
  ('Fixture',   3),
  ('Equipment', 4)
on conflict do nothing;

insert into public.levels (display_name, sort_order) values
  ('Unified',       1),
  ('EOL',           2),
  ('Final Test',    3),
  ('Programming',   4),
  ('Function Test', 5)
on conflict do nothing;

insert into public.statuses (display_name, sort_order, requires_remark, color) values
  ('Active',            1, false, 'green'),
  ('Inactive',          2, false, 'gray'),
  ('Repair',            3, true,  'yellow'),
  ('Wait Registration', 4, false, 'blue'),
  ('Wait Calibration',  5, false, 'blue')
on conflict do nothing;

insert into public.calibration_vendors (display_name, sort_order) values
  ('Internal', 1)
on conflict do nothing;

commit;
