-- =============================================================================
-- 001_seed.sql — V2. EDIT THIS FILE before running it: real locations, the
-- Equipment Types/Statuses/Levels your factory actually uses, and the
-- Calibration Due Soon window. Everything here is admin-editable afterward
-- through the UI — this is only the starting point for a fresh database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LOCATIONS — sort_order decides default display order.
-- -----------------------------------------------------------------------------
insert into public.locations (code, name, sort_order) values
  ('UNKNOWN', 'Chưa xác định',        0),   -- reserved landing spot for any record missing a location
  ('B3F1',    'Building 3 - Floor 1', 10),
  ('B3F2',    'Building 3 - Floor 2', 20),
  ('B3F3',    'Building 3 - Floor 3', 30),
  ('B3F4',    'Building 3 - Floor 4', 40),
  ('B3F5',    'Building 3 - Floor 5', 50)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- EQUIPMENT TYPES — admin-managed master data (mục 3). Add more any time
-- from Admin → Master data; no migration needed for a normal addition.
-- -----------------------------------------------------------------------------
insert into public.equipment_types (code, display_name, description, display_order) values
  ('tester',    'Tester',    null, 10),
  ('base',      'Base',      null, 20),
  ('fixture',   'Fixture',   null, 30),
  ('equipment', 'Equipment', null, 40)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- EQUIPMENT STATUSES — requires_remark drives "Remark becomes mandatory"
-- (mục 4.3, 9.3) from data. Repair is the confirmed example today; any
-- future status can set this flag the same way.
-- -----------------------------------------------------------------------------
insert into public.equipment_statuses (code, display_name, description, display_order, requires_remark) values
  ('active',   'Active',              null, 10, false),
  ('inactive', 'Inactive',            null, 20, false),
  ('repair',   'Repair',              null, 30, true),
  ('wait_reg', 'Wait Registration',   null, 40, false)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- EQUIPMENT LEVELS — admin-managed master data (mục 5).
-- -----------------------------------------------------------------------------
insert into public.equipment_levels (code, display_name, description, display_order) values
  ('unified',       'Unified',       null, 10),
  ('eol',            'EOL',           null, 20),
  ('final_test',      'Final Test',    null, 30),
  ('programming',     'Programming',   null, 40),
  ('function_test',   'Function Test', null, 50)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- PERMISSION CATALOG (mục 17) — codes are fixed by application code (only a
-- deploy can add a code that something actually checks); what's
-- admin-editable via the Users & Permissions UI is which users hold which
-- of these, not the list itself.
-- -----------------------------------------------------------------------------
insert into public.permissions (code, display_label, category, description, display_order) values
  ('equipment.create',  'Create equipment',        'equipment',   'Add new equipment records.', 10),
  ('equipment.move',    'Change parent / swap',    'equipment',   'Re-parent or swap equipment position.', 20),
  ('equipment.detach',  'Detach from parent',      'equipment',   'Remove a parent relationship.', 30),
  ('equipment.archive', 'Archive equipment',       'equipment',   'Soft-delete equipment.', 40),
  ('repair.view',       'View repair history',     'repair',      'See repair records for equipment.', 50),
  ('repair.create',     'Log a repair',            'repair',      'Create repair records.', 60),
  ('repair.update',     'Edit repair records',     'repair',      'Correct existing repair records.', 70),
  ('calibration.view',  'View calibration history','calibration', 'See calibration records and status for equipment.', 80),
  ('calibration.create','Log a calibration',       'calibration', 'Create calibration records.', 90),
  ('calibration.update','Edit calibration records','calibration', 'Correct existing calibration records.', 100),
  ('master_data.manage','Manage master data',      'admin',       'Manage Equipment Types, Statuses, Levels and Locations.', 110),
  ('field.manage',      'Manage field configuration','admin',     'Manage field presentation and custom fields.', 120)
  -- No 'user.manage': user management is deliberately role=admin only
  -- (see app/(app)/admin/layout.tsx), so a grantable code would do nothing.
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- APP SETTINGS — the Calibration Due Soon warning window, in days. Editable
-- later from Admin without a migration.
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('calibration', '{"due_soon_days": 30}'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- FIELD DEFINITIONS — presentation metadata only. types/level/status/
-- current_location_id are *_ref fields: their VALUES come from the
-- master-data tables above, not from field_options. parent_id is
-- deliberately absent here — parent only changes through Move/Swap/Detach,
-- gated by action permission, not field permission (mục 6.4).
-- -----------------------------------------------------------------------------
insert into public.field_definitions
  (field_key, display_label, data_type, input_type, is_required,
   is_visible, display_order, max_length, help_text, placeholder, is_system)
values
  ('serial_number', 'Serial Number', 'text', 'text',  true,  true, 10, 100,
   'Số serial in trên thiết bị. Đây là mã người dùng dùng để tìm và chọn Parent.', null, true),

  ('part_number',   'Part Number',   'text', 'text',  false, true, 20, 100,
   'Mã part của thiết bị.', null, true),

  ('jabil_id',      'Jabil ID',      'text', 'text',  false, true, 30, 100,
   'Mã nội bộ Jabil, ví dụ P12316.', null, true),

  ('asset',         'Asset',         'text', 'text',  false, true, 40, 100,
   'Mã tài sản dùng cho kiểm kê.', null, true),

  ('types',         'Type',          'text', 'type_ref',   false, true, 50, null,
   'Loại thiết bị — quản lý tại Admin → Master data. Không giới hạn loại nào được làm Parent của loại nào.', null, true),

  ('level',         'Level',         'text', 'level_ref',  false, true, 60, null,
   'Level của thiết bị trong dây chuyền — quản lý tại Admin → Master data.', null, true),

  ('status',        'Status',        'text', 'status_ref', false, true, 70, null,
   'Trạng thái vận hành hiện tại — quản lý tại Admin → Master data.', null, true),

  ('current_location_id', 'Current Location', 'text', 'location_ref', true, true, 80, null,
   'Vị trí hiện tại. Nếu thiết bị có Parent thì ô này là read-only và tự động '
   || 'theo Parent — muốn đổi phải dùng Move, Swap hoặc Detach.', null, true),

  ('calibration_required', 'Calibration Required', 'boolean', 'boolean', false, true, 90, null,
   'Thiết bị này có cần hiệu chuẩn định kỳ không.', null, true),

  ('remark',        'Remark',        'text', 'textarea', false, true, 100, 1000,
   'Ghi chú tự do.', null, true)
on conflict (field_key) do nothing;
