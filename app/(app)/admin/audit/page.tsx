'use client';

/**
 * Admin — Audit log. Every admin-side write (users, roles, permissions,
 * fields, master data, settings) already lands in audit_log with old/new
 * values; this is the screen that answers "who removed X's permission, and
 * when". Equipment changes have their own per-record history and are not
 * listed here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, formatTime } from '@/lib/client/api';
import { Button, EmptyState, Notice, Spinner, Tag } from '@/components/ui';
import { PageHeading } from '@/components/layout/PageHeading';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AdminNav } from '@/components/admin/AdminNav';
import { translateError } from '@/lib/i18n/errors';

const ENTITIES = [
  'user', 'field', 'location', 'equipment_type', 'equipment_status', 'equipment_level', 'department', 'permission',
] as const;
type Entity = typeof ENTITIES[number];

type AuditRow = {
  id: string;
  entity_type: Entity;
  entity_id: string | null;
  action: string;
  changes: Record<string, { old?: unknown; new?: unknown } | unknown>;
  changed_by: string | null;
  created_at: string;
  note: string | null;
  actor_username: string | null;
  entity_label: string | null;
};

const PAGE_SIZE = 50;
const MAX_VALUE_LENGTH = 120;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map(formatValue).join(', ');
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    // e.g. removed_values: { <equipment id>: <value>, … } — the count is what matters here.
    return keys.length > 3 ? `{${keys.length}}` : JSON.stringify(value);
  }
  return String(value);
}

function truncate(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/** entity_label is resolved server-side; a deleted row (e.g. a removed
 *  custom field) no longer resolves, so fall back to what the change itself
 *  recorded about it. */
function targetLabel(row: AuditRow): string {
  if (row.entity_label) return row.entity_label;
  for (const key of ['field_key', 'code', 'username']) {
    const change = row.changes[key] as { old?: unknown; new?: unknown } | undefined;
    const value = change?.new ?? change?.old;
    if (typeof value === 'string' && value) return value;
  }
  return row.entity_id ? row.entity_id.slice(0, 8) : '—';
}

function ChangeList({ changes }: { changes: AuditRow['changes'] }) {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  return (
    <ul className="grid gap-0.5">
      {entries.map(([key, change]) => {
        const pair = change && typeof change === 'object' && ('old' in change || 'new' in change)
          ? change as { old?: unknown; new?: unknown }
          : { old: undefined, new: change };
        return (
          <li key={key} className="text-[12px]" title={`${formatValue(pair.old)} → ${formatValue(pair.new)}`}>
            <span className="ident" style={{ color: 'var(--ink-3)' }}>{key}</span>{': '}
            {pair.old !== undefined && pair.old !== null && (
              <><span style={{ color: 'var(--ink-2)', textDecoration: 'line-through' }}>{truncate(formatValue(pair.old))}</span>{' → '}</>
            )}
            <span>{truncate(formatValue(pair.new))}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminAuditPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [entity, setEntity] = useState<Entity | ''>('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (before?: string) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (entity) params.set('entity_type', entity);
    if (before) params.set('before', before);
    const res = await api.get<AuditRow[]>(`/api/admin/audit?${params}`);
    setHasMore(res.data.length === PAGE_SIZE);
    return res.data;
  }, [entity]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await load());
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      // `before` is inclusive server-side (rows can share a timestamp), so
      // the first few may repeat what's already shown.
      const more = await load(last.created_at);
      const seen = new Set(rows.map((r) => r.id));
      const fresh = more.filter((r) => !seen.has(r.id));
      if (fresh.length === 0) setHasMore(false);
      setRows((current) => [...current, ...fresh]);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-page">
      <PageHeading title={t('adminAudit.title')} subtitle={t('adminAudit.subtitle')} />

      <AdminNav />

      {error && <div className="mb-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>}

      <div className="equipment-panel">
        <div className="equipment-filters">
          <SearchableSelect
            ariaLabel={t('adminAudit.entityFilter')} value={entity}
            onChange={(v) => setEntity(v as Entity | '')}
            options={[
              { value: '', label: t('adminAudit.allEntities') },
              ...ENTITIES.map((e) => ({ value: e, label: t(`adminAudit.entity_${e}`) })),
            ]}
            className="w-48 border px-2 py-1 text-[12px]"
          />
          <Button size="sm" onClick={() => void refresh()}>{t('adminErrors.refresh')}</Button>
        </div>
        <div className="equipment-scroll" aria-busy={loading || undefined}>
          {loading ? (
            <Spinner label={t('adminAudit.loading')} />
          ) : rows.length === 0 ? (
            <EmptyState title={t('adminAudit.empty')} subtitle={t('adminAudit.emptyHint')} />
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>{t('adminAudit.time')}</th>
                  <th>{t('adminAudit.actor')}</th>
                  <th>{t('adminAudit.action')}</th>
                  <th>{t('adminAudit.target')}</th>
                  <th>{t('adminAudit.changes')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{formatTime(row.created_at)}</td>
                    <td className="ident">{row.actor_username ?? t('adminAudit.system')}</td>
                    <td className="ident" style={{ whiteSpace: 'nowrap' }}>{row.action}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag text={t(`adminAudit.entity_${row.entity_type}`)} />
                        <span className="ident">{targetLabel(row)}</span>
                      </div>
                    </td>
                    <td>
                      <ChangeList changes={row.changes} />
                      {row.note && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>{row.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && hasMore && (
          <div className="flex justify-center p-3">
            <Button size="sm" loading={loadingMore} onClick={() => void loadMore()}>{t('adminAudit.loadMore')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
