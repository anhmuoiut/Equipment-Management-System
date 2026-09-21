'use client';

/**
 * Header bell + dropdown panel. Every row here is derived server-side from
 * `equipment_calibration_status` (see lib/services/notifications.ts) — this
 * component never computes OVERDUE/DUE_SOON/NOT_CALIBRATED itself, so it
 * can't disagree with the Dashboard or the Masterlist about what's due.
 * The only client-owned state is which keys are already marked read, and
 * even that's optimistic — the server call is the source of truth, this
 * just avoids a flash of "unread" while it's in flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';

type NotificationRow = {
  key: string;
  equipment_id: string;
  serial_number: string;
  part_number: string | null;
  type_label: string | null;
  location_label: string | null;
  calibration_status: 'OVERDUE' | 'NOT_CALIBRATED' | 'DUE_SOON';
  calibration_due_date: string | null;
  is_read: boolean;
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<NotificationRow[]>('/api/notifications');
      setRows(res.data);
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
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = rows.filter((r) => !r.is_read);

  async function markRead(keys: string[]) {
    if (keys.length === 0) return;
    setRows((prev) => prev.map((r) => (keys.includes(r.key) ? { ...r, is_read: true } : r)));
    try {
      await api.post('/api/notifications/read', { keys });
    } catch {
      void load();
    }
  }

  function openEquipment(row: NotificationRow) {
    setOpen(false);
    void markRead([row.key]);
    router.push(`/equipment?equipmentId=${row.equipment_id}`);
  }

  return (
    <div className="notification-bell" ref={ref}>
      <button
        type="button" className="notification-trigger" onClick={() => setOpen((o) => !o)}
        aria-haspopup="true" aria-expanded={open} aria-label={t('notifications.title')}
      >
        <Bell size={18} aria-hidden="true" />
        {unread.length > 0 && (
          <span className="notification-badge" aria-hidden="true">{unread.length > 99 ? '99+' : unread.length}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="region" aria-label={t('notifications.title')}>
          <div className="notification-panel-head">
            <span>{t('notifications.title')}</span>
            {unread.length > 0 && (
              <button type="button" onClick={() => void markRead(unread.map((r) => r.key))}>
                <CheckCheck size={13} aria-hidden="true" />{t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <div className="notification-list">
            {loading && rows.length === 0 ? (
              <p className="notification-empty">{t('common.loadingEllipsis')}</p>
            ) : loadFailed ? (
              <p className="notification-empty">{t('notifications.loadError')}</p>
            ) : rows.length === 0 ? (
              <p className="notification-empty">{t('notifications.empty')}</p>
            ) : rows.map((row) => (
              <button
                key={row.key} type="button" className="notification-item"
                data-unread={!row.is_read} data-level={row.calibration_status}
                onClick={() => openEquipment(row)}
              >
                <span className="notification-item-dot" aria-hidden="true" />
                <span className="notification-item-body">
                  <span className="notification-item-title">
                    {row.part_number ?? row.serial_number}
                    {row.part_number ? ` · ${row.serial_number}` : ''}
                  </span>
                  <span className="notification-item-meta">
                    {t(`calibration.state.${row.calibration_status}`)}
                    {row.calibration_due_date ? ` · ${row.calibration_due_date}` : ''}
                    {row.location_label ? ` · ${row.location_label}` : ''}
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
