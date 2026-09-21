-- =============================================================================
-- 001_seed.sql  —  Spec v0.9 mục 54 (đầu vào bắt buộc của migration script)
-- =============================================================================
-- SỬA FILE NÀY TRƯỚC KHI CHẠY. Đây là 2 trong 6 thứ mục 54 nói phải chốt trước
-- khi code: danh sách location và dropdown option thật của nhà máy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LOCATIONS  — sort_order quyết định thứ tự hiển thị mặc định (mục 18)
-- -----------------------------------------------------------------------------
insert into public.locations (code, name, sort_order) values
  ('UNKNOWN', 'Chưa xác định',        0),   -- BẮT BUỘC: migration cần chỗ chứa record thiếu location
  ('B3F1',    'Building 3 - Floor 1', 10),
  ('B3F2',    'Building 3 - Floor 2', 20),
  ('B3F3',    'Building 3 - Floor 3', 30),
  ('B3F4',    'Building 3 - Floor 4', 40),
  ('B3F5',    'Building 3 - Floor 5', 50)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- FIELD DEFINITIONS
-- -----------------------------------------------------------------------------
-- parent_id CỐ TÌNH không có ở đây: parent chỉ đổi qua move/detach/swap,
-- gate bằng action permission chứ không bằng field permission (mục 6.4).
-- -----------------------------------------------------------------------------
insert into public.field_definitions
  (field_key, display_label, data_type, input_type, is_required,
   is_visible, display_order, max_length, dropdown_options, help_text, is_system)
values
  ('serial_number', 'Serial Number', 'text', 'text',  true,  true, 10, 100, null,
   'Số serial in trên thiết bị. Đây là mã người dùng dùng để tìm và chọn Parent.', false),

  ('part_number',   'Part Number',   'text', 'text',  false, true, 20, 100, null,
   'Mã part của thiết bị.', false),

  ('jabil_id',      'Jabil ID',      'text', 'text',  false, true, 30, 100, null,
   'Mã nội bộ Jabil, ví dụ P12316.', false),

  ('asset',         'Asset',         'text', 'text',  false, true, 40, 100, null,
   'Mã tài sản dùng cho kiểm kê.', false),

  ('types',         'Type',          'text', 'dropdown', false, true, 50, null,
   '[{"value":"tester","label":"Tester","is_active":true},
     {"value":"base","label":"Base","is_active":true},
     {"value":"fixture","label":"Fixture","is_active":true},
     {"value":"equipment","label":"Equipment","is_active":true}]'::jsonb,
   'Loại thiết bị. Không giới hạn loại nào được làm Parent của loại nào.', false),

  ('level',         'Level',         'text', 'dropdown', false, true, 60, null,
   '[{"value":"unified","label":"Unified","is_active":true},
     {"value":"eol","label":"EOL","is_active":true},
     {"value":"final_test","label":"Final Test","is_active":true},
     {"value":"programming","label":"Programming","is_active":true},
     {"value":"function_test","label":"Function Test","is_active":true}]'::jsonb,
   'Level của thiết bị trong dây chuyền.', false),

  ('status',        'Status',        'text', 'dropdown', false, true, 70, null,
   '[{"value":"active","label":"Active","is_active":true},
     {"value":"inactive","label":"Inactive","is_active":true},
     {"value":"repair","label":"Under Repair","is_active":true},
     {"value":"wait_reg","label":"Under Registration","is_active":true}]'::jsonb,
   'Trạng thái vận hành hiện tại.', false),

  ('current_location_id', 'Current Location', 'text', 'location_ref', true, true, 80, null, null,
   'Vị trí hiện tại. Nếu thiết bị có Parent thì ô này là read-only và tự động '
   || 'theo Parent — muốn đổi phải dùng Move, Swap hoặc Detach.', false),

  ('remark',        'Remark',        'text', 'textarea', false, true, 90, 1000, null,
   'Ghi chú tự do.', false)
on conflict (field_key) do nothing;
