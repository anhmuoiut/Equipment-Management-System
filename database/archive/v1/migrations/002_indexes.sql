-- =============================================================================
-- 002_indexes.sql  —  Spec v0.9 mục 45
-- =============================================================================
-- Có chủ đích KHÔNG tạo:
--   * (current_location_id, serial_number) — default sort đi qua join tới
--     locations.sort_order nên composite index này không phục vụ được.
--   * partial index trên (id) — không giúp gì cho query dashboard.
-- Các btree dưới đây phục vụ FILTER và JOIN, KHÔNG phục vụ search '%term%'.
-- =============================================================================

create index if not exists idx_equipment_serial_number on public.equipment (serial_number);
create index if not exists idx_equipment_part_number   on public.equipment (part_number);
create index if not exists idx_equipment_asset         on public.equipment (asset);
create index if not exists idx_equipment_parent_id     on public.equipment (parent_id);
create index if not exists idx_equipment_archived_at   on public.equipment (archived_at);

create index if not exists idx_equipment_location_id
  on public.equipment (current_location_id) where archived_at is null;
create index if not exists idx_equipment_status
  on public.equipment (status) where archived_at is null;
create index if not exists idx_equipment_types
  on public.equipment (types) where archived_at is null;

-- audit_log
create index if not exists idx_audit_equipment
  on public.audit_log (entity_id, created_at desc) where entity_type = 'equipment';
create index if not exists idx_audit_recent
  on public.audit_log (created_at desc);

-- error_log
create index if not exists idx_error_log_request on public.error_log (request_id);
create index if not exists idx_error_log_recent  on public.error_log (created_at desc);

-- locations
create index if not exists idx_locations_sort on public.locations (sort_order, code);

create index if not exists idx_equipment_location_id on public.locations (request_id);

create index if not exists idx_equipment_part_number on public.equipment (asset);


