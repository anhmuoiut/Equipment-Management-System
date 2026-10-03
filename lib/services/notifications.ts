import 'server-only';

/**
 * Thông báo tài khoản (bảng notifications) — docs/DATABASE_MODIFIED.md mục 7.
 * Chỉ dùng cho việc liên quan đến tài khoản. Quá hạn hiệu chuẩn và thay đổi
 * dữ liệu xem trên Dashboard, không gửi thông báo.
 */
import { db } from './core/db';
import { withActorNames } from './core/history';
import { AppError, mapRpcError } from '@/lib/errors';
import type { NotificationRow, NotificationType } from '@/lib/types';

type NewNotification = {
  type: NotificationType; title: string; message?: string | null; link?: string | null;
  entity_id?: string | null; created_by?: string | null;
};

export async function notify(recipientIds: string[], n: NewNotification): Promise<void> {
  if (recipientIds.length === 0) return;
  const { error } = await db().from('notifications').insert(recipientIds.map((recipient_id) => ({
    recipient_id, type: n.type, title: n.title, message: n.message ?? null, link: n.link ?? null,
    entity_id: n.entity_id ?? null, created_by: n.created_by ?? null,
  })));
  // Thông báo hỏng không được làm hỏng thao tác chính.
  if (error) console.error('notify failed', error.message);
}

export async function notifyAdmins(n: NewNotification): Promise<void> {
  const { data, error } = await db().from('user_profiles').select('id').eq('role', 'admin').eq('account_status', 'active');
  if (error) { console.error('notifyAdmins lookup failed', error.message); return; }
  await notify((data ?? []).map((r) => (r as { id: string }).id), n);
}

export async function listNotifications(userId: string): Promise<{ items: NotificationRow[]; unread: number }> {
  const { data, error } = await db().from('notifications')
    .select('id, type, title, message, link, entity_id, read_at, created_at, created_by')
    .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(50);
  if (error) throw mapRpcError(error);
  const rows = await withActorNames((data ?? []) as (Omit<NotificationRow, 'created_by_name' | 'handled'> & { created_by: string | null })[]);

  // Yêu cầu duyệt đã được một admin khác xử lý → "đã xử lý".
  const pendingIds = rows.filter((r) => r.type === 'USER_APPROVAL_REQUEST' && r.entity_id).map((r) => r.entity_id!);
  const stillPending = new Set<string>();
  if (pendingIds.length) {
    const { data: users } = await db().from('user_profiles').select('id').in('id', pendingIds).eq('account_status', 'pending');
    (users ?? []).forEach((u) => stillPending.add((u as { id: string }).id));
  }
  const items = rows.map(({ created_by: _c, ...r }) => ({
    ...r,
    handled: r.type === 'USER_APPROVAL_REQUEST' && !!r.entity_id && !stillPending.has(r.entity_id),
  }));

  const { count, error: countError } = await db().from('notifications')
    .select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null);
  if (countError) throw mapRpcError(countError);
  return { items, unread: count ?? 0 };
}

/** Đánh dấu đã đọc: danh sách id, hoặc tất cả khi ids rỗng. Chỉ thông báo của chính mình. */
export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length > 200) throw new AppError('VALIDATION_ERROR');
  let query = db().from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId).is('read_at', null);
  if (ids.length) query = query.in('id', ids);
  const { error } = await query;
  if (error) throw mapRpcError(error);
}
