'use client';

/**
 * Chuông thông báo trên top bar — chỉ thông báo tài khoản (bảng notifications):
 * yêu cầu duyệt tài khoản, được duyệt, đổi nhóm quyền, đặt lại mật khẩu, sửa
 * thông tin. Quá hạn hiệu chuẩn không ở đây — xem trên Dashboard.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck } from 'lucide-react';
import { api, ApiError, formatRelativeTime } from '@/lib/client/api';
import type { NotificationRow } from '@/lib/types';

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: NotificationRow[]; unread: number }>('/api/notifications');
      setRows(res.data.items);
      setUnread(res.data.unread);
      setLoadFailed(false);
    } catch (e) {
      if (e instanceof ApiError) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function markRead(ids: string[]) {
    const now = new Date().toISOString();
    setRows((prev) => prev.map((r) => (ids.length === 0 || ids.includes(r.id) ? { ...r, read_at: r.read_at ?? now } : r)));
    setUnread((n) => (ids.length === 0 ? 0 : Math.max(0, n - ids.filter((id) => rows.find((r) => r.id === id && !r.read_at)).length)));
    try { await api.post('/api/notifications/read', { ids }); } catch { void load(); }
  }

  function openRow(row: NotificationRow) {
    setOpen(false);
    if (!row.read_at) void markRead([row.id]);
    if (row.link) router.push(row.link);
  }

  const text = (row: NotificationRow) => t(`notif.${row.type}`, { title: row.title, message: row.message ?? '', role: t(`values.${row.title}`, { defaultValue: row.title }) });

  return (
    <div className="notification-bell" ref={ref}>
      <button type="button" className="notification-trigger" onClick={() => setOpen((o) => !o)}
        aria-haspopup="true" aria-expanded={open} aria-label={t('notif.title')}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="region" aria-label={t('notif.title')}>
          <div className="notification-panel-head">
            <span>{t('notif.title')}</span>
            {unread > 0 && (
              <button type="button" onClick={() => void markRead([])}>
                <CheckCheck size={13} aria-hidden="true" />{t('notif.markAllRead')}
              </button>
            )}
          </div>
          <div className="notification-list">
            {loading && rows.length === 0 ? <p className="notification-empty">{t('common.loadingEllipsis')}</p>
              : loadFailed ? <p className="notification-empty">{t('notif.loadError')}</p>
                : rows.length === 0 ? <p className="notification-empty">{t('notif.empty')}</p>
                  : rows.map((row) => (
                    <button key={row.id} type="button" className="notification-item" data-unread={!row.read_at} onClick={() => openRow(row)}>
                      <span className="notification-item-dot" aria-hidden="true" />
                      <span className="notification-item-body">
                        <span className="notification-item-title">{text(row)}</span>
                        <span className="notification-item-meta">
                          {formatRelativeTime(row.created_at, language)}
                          {row.created_by_name ? ` · ${row.created_by_name}` : ''}
                          {row.handled ? ` · ${t('notif.handled')}` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
          </div>
        </div>
      )}
    </div>
  );
}
