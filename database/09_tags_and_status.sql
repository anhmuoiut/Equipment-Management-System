-- =============================================================================
-- 09_tags_and_status.sql — thiết kế lại Status → Thẻ (tags) + Status của thiết bị = Usage (database đã dựng).
--
-- Database dựng từ 02_schema.sql mới đã có thiết kế này: không cần chạy file này.
--
-- File này THAY file 09_status_calibration_role.sql cũ (tính năng "vai trò hiệu chuẩn" đã bỏ — nếu đã
-- chạy file cũ thì file này dọn lại). Thứ tự: chạy sau 05 – 08, RỒI chạy lại 04_functions.sql.
-- Chạy lại nhiều lần được.
--
-- 1. Bảng statuses đổi tên thành tags (thẻ có màu để chọn trong phần Remark); bỏ cột requires_remark,
--    calibration_role và trigger "Status theo hiệu chuẩn".
-- 2. Equipment / Golden sample / Calibration có cột tag_ids (nhiều thẻ). Status cũ của thiết bị và
--    golden sample được chuyển thành thẻ tương ứng (không mất thông tin), rồi cột status_id bị bỏ.
-- 3. Status của thiết bị nay là cột usage (In use / Not in use); Calibration Status do hệ thống tự tính.
--
-- Lịch sử cũ giữ nguyên (chỉ đọc): dòng lịch sử cấu hình của Status cũ nằm lại dưới tên bảng "statuses".
-- =============================================================================
begin;

-- ---- 1. statuses → tags ------------------------------------------------------------
drop trigger if exists calibration_equipments_status_after on public.calibration_equipments;
drop function if exists public.calibration_status_after();
do $$
begin
  if to_regclass('public.statuses') is not null then
    drop trigger if exists statuses_calibration_role_single on public.statuses;
  end if;
end
$$;
drop function if exists public.status_calibration_role_single();

do $$
begin
  if to_regclass('public.statuses') is not null and to_regclass('public.tags') is null then
    alter table public.statuses rename to tags;
    alter table public.tags drop column if exists requires_remark;
    alter table public.tags drop column if exists calibration_role;
    alter index if exists public.statuses_display_name_key rename to tags_display_name_key;
    alter index if exists public.statuses_sort_idx rename to tags_sort_idx;
    alter table public.tags rename constraint statuses_color_check to tags_color_check;
    alter trigger statuses_set_updated_at on public.tags rename to tags_set_updated_at;
  end if;
end
$$;
drop index if exists public.statuses_calibration_role_key;
comment on column public.tags.color is 'Màu hiển thị (5 màu hệ thống): green / yellow / red / blue / gray.';

-- Lịch sử cấu hình: nhận thêm tên bảng "tags" (các dòng cũ của "statuses" vẫn hợp lệ).
alter table public.configuration_histories drop constraint if exists configuration_histories_table_name_check;
alter table public.configuration_histories add constraint configuration_histories_table_name_check check (table_name in (
  'part_numbers', 'locations', 'types', 'statuses', 'tags', 'levels', 'departments',
  'calibration_configurations', 'calibration_vendors'));

-- ---- 2. tag_ids + chuyển Status cũ thành thẻ ------------------------------------------
alter table public.equipments           add column if not exists tag_ids uuid[] not null default '{}';
alter table public.golden_samples       add column if not exists tag_ids uuid[] not null default '{}';
alter table public.calibration_equipments add column if not exists tag_ids uuid[] not null default '{}';
create index if not exists equipments_tags_idx            on public.equipments using gin (tag_ids);
create index if not exists golden_samples_tags_idx        on public.golden_samples using gin (tag_ids);
create index if not exists calibration_equipments_tags_idx on public.calibration_equipments using gin (tag_ids);

-- Chuyển không ghi lịch sử (đây là đổi cấu trúc, không phải thao tác của người dùng).
alter table public.equipments     disable trigger equipments_write_history;
alter table public.golden_samples disable trigger golden_samples_write_history;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'equipments' and column_name = 'status_id') then
    update public.equipments set tag_ids = array[status_id] where status_id is not null and cardinality(tag_ids) = 0;
    alter table public.equipments drop column status_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'golden_samples' and column_name = 'status_id') then
    update public.golden_samples set tag_ids = array[status_id] where status_id is not null and cardinality(tag_ids) = 0;
    alter table public.golden_samples drop column status_id;
  end if;
end
$$;

alter table public.equipments     enable trigger equipments_write_history;
alter table public.golden_samples enable trigger golden_samples_write_history;

comment on column public.equipments.usage is
  'Status của thiết bị: đang dùng (in_use) / không dùng (not_in_use) — đổi bằng Check-out / Check-in và đổi theo chỗ khi Swap. Hệ thống tự quản, không có danh sách cấu hình.';
comment on column public.equipments.tag_ids is
  'Thẻ (tags.id) người dùng chọn trong phần Remark; database kiểm tra mọi lần ghi (04_functions.sql mục 3e).';

commit;

-- -----------------------------------------------------------------------------
-- Kiểm tra: tags có các thẻ (từ Status cũ); ba bảng có tag_ids; status_id đã bỏ (cột còn lại: 0 dòng).
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.tags) as tags,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'tag_ids'
      and table_name in ('equipments', 'golden_samples', 'calibration_equipments')) as tag_id_columns,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'status_id'
      and table_name in ('equipments', 'golden_samples')) as old_status_columns;
