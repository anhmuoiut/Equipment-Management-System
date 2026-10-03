-- =============================================================================
-- 05_status_color.sql — thêm màu cho trạng thái (statuses.color) vào database
-- đã chạy 02_schema.sql trước khi có cột này.
--
-- 5 màu hệ thống (docs/DATABASE_MODIFIED.md › statuses): green / yellow / red /
-- blue / gray. Trạng thái mẫu được gán màu gợi ý theo tên; trạng thái khác giữ
-- gray — admin đổi ở Configuration › Status.
--
-- Chạy lại nhiều lần được. Database cài mới (02 đã có cột color) chạy cũng không sao.
-- =============================================================================

begin;

alter table public.statuses add column if not exists color text not null default 'gray';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'statuses_color_check') then
    alter table public.statuses
      add constraint statuses_color_check check (color in ('green', 'yellow', 'red', 'blue', 'gray'));
  end if;
end;
$$;

comment on column public.statuses.color is 'Màu hiển thị (5 màu hệ thống): green / yellow / red / blue / gray.';

-- Lịch sử cấu hình ghi nguồn "script" cho lần gán màu này.
select public.set_ctx('source', 'script');

update public.statuses s
set color = m.color
from (values
  ('active', 'green'),
  ('pass', 'green'),
  ('repair', 'yellow'),
  ('fail', 'red'),
  ('wait registration', 'blue'),
  ('inactive', 'gray')
) as m (name, color)
where lower(s.display_name) = m.name
  and s.color = 'gray'
  and s.color <> m.color;

commit;

-- Kiểm tra: mỗi trạng thái một màu.
select display_name, applies_to, color from public.statuses order by sort_order, display_name;
