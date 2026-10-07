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

insert into public.tags (display_name, sort_order, color) values
  ('Repair',            1, 'yellow'),
  ('Wait Registration', 2, 'blue'),
  ('Wait Calibration',  3, 'blue'),
  ('Spare',             4, 'gray')
on conflict do nothing;

insert into public.calibration_vendors (display_name, sort_order) values
  ('Internal', 1)
on conflict do nothing;

commit;
