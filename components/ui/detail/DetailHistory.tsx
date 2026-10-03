'use client';

/**
 * Tab Lịch sử — dòng thời gian từ bảng <module>_histories, dạng
 * "Trường: cũ → mới". Dùng chung cho mọi module (docs/DETAIL_MODEL.md 3.4).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, formatDate, formatTime } from '@/lib/client/api';
import { translateError } from '@/lib/i18n/errors';
import { ErrorState, Spinner } from '@/components/ui';
import type { HistoryEntry } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{4}-\d{2}-\d{2}T/;

export function useFormatHistoryValue() {
  const { t } = useTranslation();
  return (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
    if (Array.isArray(value)) return value.map((v) => t(`values.${v}`, { defaultValue: String(v) })).join(', ');
    if (typeof value === 'string' && DATE_RE.test(value)) return formatDate(value);
    if (typeof value === 'string' && TIME_RE.test(value)) return formatTime(value);
    if (typeof value === 'string') return t(`values.${value}`, { defaultValue: value });
    return String(value);
  };
}

/** Ghi chú do database đặt: via_parent:SN, swap_with:SN, stayed:SN, stayed_swap:SN, parent_deleted:SN. */
export function useFormatNote() {
  const { t } = useTranslation();
  return (note: string | null): string | null => {
    if (!note) return null;
    const [kind, ...rest] = note.split(':');
    const value = rest.join(':');
    if (kind === 'via_parent') return t('hist.viaParent', { serial: value });
    if (kind === 'swap_with') return t('hist.swapWith', { serial: value });
    if (kind === 'stayed') return t('hist.stayed', { serial: value });
    if (kind === 'stayed_swap') return t('hist.stayedSwap', { serial: value });
    if (kind === 'parent_deleted') return t('hist.parentDeleted', { serial: value });
    return note;
  };
}

export function HistoryChanges({ changes, fieldLabel }: {
  changes: HistoryEntry['changes']; fieldLabel: (key: string) => string;
}) {
  const format = useFormatHistoryValue();
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return null;
  return (
    <ul className="hist-changes">
      {entries.map(([key, change]) => (
        <li key={key}>
          <span className="hist-field">{fieldLabel(key)}:</span>{' '}
          {change.old !== null && change.old !== undefined && <><span className="hist-old">{format(change.old)}</span> → </>}
          <span className="hist-new">{format(change.new)}</span>
        </li>
      ))}
    </ul>
  );
}

export function DetailHistory({ url, fieldLabel, filter }: {
  url: string;
  fieldLabel: (key: string) => string;
  /** Bộ lọc nhanh, ví dụ "Chỉ lần hiệu chuẩn" (thêm ?only=…). */
  filter?: { label: string; param: string };
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const formatNote = useFormatNote();
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filtered, setFiltered] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<HistoryEntry[]>(filtered && filter ? `${url}?${filter.param}` : url);
      setRows(res.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    }
  }, [url, filtered, filter]);

  useEffect(() => { setRows(null); void load(); }, [load]);

  let body: ReactNode;
  if (error) body = <ErrorState message={translateError(error.code, language, error.message)} onRetry={load} />;
  else if (!rows) body = <Spinner label={t('common.loadingEllipsis')} />;
  else if (rows.length === 0) body = <p className="hist-empty">{t('hist.empty')}</p>;
  else {
    body = (
      <ol className="hist-list">
        {rows.map((row) => (
          <li key={row.id} className="hist-item" data-action={row.action}>
            <div className="hist-head">
              <span className="hist-action">{t(`hist.action.${row.action}`, { defaultValue: row.action })}</span>
              <time className="hist-time" dateTime={row.created_at}>{formatTime(row.created_at)}</time>
            </div>
            <div className="hist-by">
              {row.created_by_name ?? t('hist.system')}
              {row.source !== 'ui' && <> · {t(`hist.source.${row.source}`, { defaultValue: row.source })}</>}
            </div>
            {formatNote(row.note) && <div className="hist-note">{formatNote(row.note)}</div>}
            <HistoryChanges changes={row.changes} fieldLabel={fieldLabel} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="hist">
      {filter && (
        <label className="hist-filter">
          <input type="checkbox" checked={filtered} onChange={(e) => setFiltered(e.target.checked)} />
          {filter.label}
        </label>
      )}
      {body}
    </div>
  );
}
