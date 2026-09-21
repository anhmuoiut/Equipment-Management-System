import 'server-only';

/**
 * Notification Center — hybrid design (see database/migrations/002_notification_reads.sql
 * for the full rationale):
 *   - The alert itself (equipment X is OVERDUE / DUE_SOON / NOT_CALIBRATED) is
 *     never stored here. It's derived every time from `listCalibrationAlerts`
 *     (lib/services/calibration.ts) — the exact same query the Dashboard's
 *     "Needs attention" list reads, off `equipment_calibration_status` and
 *     `app_settings.calibration.due_soon_days`. There is no second copy of
 *     the calibration business rules in this file.
 *   - Only per-user READ STATE is persisted (`notification_reads`), keyed by
 *     a content-addressed id (equipment + status + due date) so a genuinely
 *     new fact (recalibration, status change) always reappears unread while
 *     an unchanged one never re-notifies — no separate dedup/expiry pass
 *     needed, and nothing to go stale.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';
import { listCalibrationAlerts, type CalibrationAlertRow } from './calibration';

export type Notification = CalibrationAlertRow & {
  key: string;
  is_read: boolean;
};

export function notificationKey(row: Pick<CalibrationAlertRow, 'equipment_id' | 'calibration_status' | 'calibration_due_date'>): string {
  return `${row.equipment_id}:${row.calibration_status}:${row.calibration_due_date ?? 'none'}`;
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const alerts = await listCalibrationAlerts();
  if (alerts.length === 0) return [];

  const keys = alerts.map(notificationKey);
  const { data: reads, error } = await supabaseAdmin()
    .from('notification_reads')
    .select('notification_key')
    .eq('user_id', userId)
    .in('notification_key', keys);
  if (error) throw mapRpcError(error);
  const readSet = new Set((reads ?? []).map((r) => (r as { notification_key: string }).notification_key));

  return alerts.map((row) => {
    const key = notificationKey(row);
    return { ...row, key, is_read: readSet.has(key) };
  });
}

export async function markNotificationsRead(userId: string, keys: string[]): Promise<void> {
  const unique = [...new Set(keys)].filter(Boolean);
  if (unique.length === 0) return;
  if (unique.length > 200) throw new AppError('VALIDATION_ERROR', { keys: 'Too many keys in one request.' });

  const { error } = await supabaseAdmin()
    .from('notification_reads')
    .upsert(
      unique.map((key) => ({ user_id: userId, notification_key: key })),
      { onConflict: 'user_id,notification_key', ignoreDuplicates: true },
    );
  if (error) throw mapRpcError(error);
}
