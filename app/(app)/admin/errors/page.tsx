'use client';

/**
 * Admin — Error log. Spec v0.9 mục 6.7, 47d.
 *
 * Vercel Hobby only keeps logs for about an hour, so `error_log` in the
 * database is the only place to look up what happened to a user's request
 * from yesterday. Users read the request_id off their own error screen and
 * hand it to Admin, so that's the field this screen is built to search by.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, formatTime } from '@/lib/client/api';
import { Button, Notice, Spinner } from '@/components/ui';
import { PageHeading } from '@/components/layout/PageHeading';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AdminNav } from '@/components/admin/AdminNav';
import { translateError } from '@/lib/i18n/errors';

type ErrorRow = {
  id: string;
  request_id: string;
  route: string | null;
  user_id: string | null;
  error_code: string | null;
  message: string | null;
  created_at: string;
};

const LIMITS = [50, 100, 200] as const;

export default function AdminErrorsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [limit, setLimit] = useState<number>(50);
  const [search, setSearch] = useState('');
  // Debounced copy of the search box — the search runs server-side over the
  // whole log (not just the rows loaded), so not one request per keystroke.
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (query) params.set('request_id', query);
      const res = await api.get<ErrorRow[]>(`/api/admin/errors?${params}`);
      setRows(res.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [limit, query]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = rows;

  return (
    <div className="admin-page">
      <PageHeading title={t('adminErrors.title')} subtitle={t('adminErrors.subtitle')} />

      <AdminNav />

      {error && <div className="mb-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>}

      <div className="equipment-panel">
        <div className="equipment-filters">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            aria-label={t('adminErrors.searchRequestId')}
            placeholder={t('adminErrors.searchRequestIdPlaceholder')}
            className="w-64 max-w-full border px-2.5 py-1 text-[13px] ident" style={{ borderColor: 'var(--rule)' }} />
          <SearchableSelect
            ariaLabel={t('adminErrors.last')} value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            options={LIMITS.map((n) => ({ value: String(n), label: `${t('adminErrors.last')} ${n}` }))}
            className="w-32 border px-2 py-1 text-[12px]"
          />
          <Button size="sm" onClick={() => void refresh()}>{t('adminErrors.refresh')}</Button>
          <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('adminErrors.searchHint')}</span>
          <span className="ml-auto text-[12px]" style={{ color: 'var(--ink-3)' }}>
            {loading ? t('common.loadingEllipsis') : filtered.length + ' ' + t('adminErrors.entries')}
          </span>
        </div>
        <div className="equipment-scroll">
          {loading ? (
            <Spinner label={t('adminErrors.loadingLog')} />
          ) : filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[14px]">{t(query ? 'adminErrors.noMatchingErrors' : 'adminErrors.noErrorsLogged')}</p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                {t(query ? 'adminErrors.tryDifferentRequestId' : 'adminErrors.noErrorsLoggedHint')}
              </p>
            </div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>{t('adminErrors.time')}</th>
                  <th>{t('adminErrors.requestId')}</th>
                  <th>{t('adminErrors.route')}</th>
                  <th>{t('adminErrors.code')}</th>
                  <th>{t('adminErrors.message')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{formatTime(row.created_at)}</td>
                    <td className="ident">{row.request_id}</td>
                    <td className="ident" style={{ color: 'var(--ink-2)' }}>{row.route ?? '—'}</td>
                    <td>{row.error_code ?? '—'}</td>
                    <td style={{ color: 'var(--ink-2)' }}>{row.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
