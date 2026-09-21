-- =============================================================================
-- 003_rls_lockdown.sql  —  Spec v0.9 mục 3c
-- =============================================================================
-- RLS deny-all: BẬT RLS, KHÔNG tạo policy nào.
--
-- Mục đích duy nhất: chặn truy cập trực tiếp bằng anon key.
-- KHÔNG coi đây là lớp chống bug "quên check quyền trong route" —
-- service_role bypass RLS hoàn toàn, nên lớp bảo vệ thật là withAuth (lib/auth).
-- =============================================================================

alter table public.locations         enable row level security;
alter table public.user_profiles     enable row level security;
alter table public.equipment         enable row level security;
alter table public.field_definitions enable row level security;
alter table public.field_permissions enable row level security;
alter table public.audit_log         enable row level security;
alter table public.error_log         enable row level security;

-- Supabase cấp sẵn quyền trên schema public cho anon/authenticated.
-- Thu hồi để anon key không đọc/ghi được gì kể cả khi RLS bị tắt nhầm.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Bảng/hàm tạo về sau cũng mặc định bị chặn.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- service_role phải được cấp quyền TƯỜNG MINH.
-- Supabase có cấp sẵn, nhưng không dựa vào mặc định của nhà cung cấp: nếu thứ tự
-- migration đổi hoặc restore từ dump vào project mới, cả app sẽ chết vì
-- "permission denied for table equipment" mà không rõ nguyên nhân.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- audit_log là append-only: không có đường UPDATE/DELETE kể cả cho service_role
-- đi qua API. (service_role vẫn sửa được bằng SQL tay — chấp nhận, ghi vào RUNBOOK.)
revoke update, delete on public.audit_log from public;
