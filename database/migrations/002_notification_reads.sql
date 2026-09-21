-- =============================================================================
-- 002_notification_reads.sql — paste into Supabase SQL Editor and run once.
--
-- Notification Center architecture (hybrid — see full_reset.sql section 13
-- for why calibration status itself is never persisted):
--   - WHAT is shown is never stored here. Every notification is derived,
--     at read time, from `equipment_calibration_status` (which is itself
--     derived from calibration_records + app_settings.calibration.due_soon_days)
--     via lib/services/calibration.ts's listCalibrationAlerts — the same
--     function the Dashboard's "Needs attention" list reads. There is no
--     second copy of the OVERDUE/DUE_SOON/NOT_CALIBRATED thresholds
--     anywhere in this table or the code that reads it.
--   - WHETHER a user has already seen a given alert is the only thing this
--     table persists, since "read" has no meaning as a derived fact.
--   - Each row's key is content-addressed: equipment_id + calibration_status
--     + calibration_due_date. If the underlying fact changes (equipment is
--     recalibrated and gets a new due date, or transitions from DUE_SOON to
--     OVERDUE), the key changes and the alert naturally reappears unread —
--     no explicit dedup/expiry logic needed, and no risk of a stale "read"
--     hiding a genuinely new problem.
-- Incremental — does NOT drop or touch any other existing table/data.
-- =============================================================================
begin;

create table public.notification_reads (
  user_id           uuid not null references public.user_profiles(id) on delete cascade,
  notification_key  text not null,
  read_at           timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index idx_notification_reads_user on public.notification_reads (user_id);

-- Same RLS shape as every other table (full_reset.sql section 11):
-- deny-all, service_role bypasses RLS and is the only role granted access —
-- the API route scopes every query to the caller's own session user_id
-- server-side (lib/auth/withAuth.ts), the same way every other table here
-- is protected in app code rather than by RLS.
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon, authenticated;
grant all on public.notification_reads to service_role;

commit;

-- =============================================================================
-- DONE. No further action needed — the Notification Center reads this table
-- automatically once deployed (lib/services/notifications.ts).
-- =============================================================================
