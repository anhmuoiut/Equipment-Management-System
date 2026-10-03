'use client';

/**
 * Dashboard (docs/DATABASE_MODIFIED.md mục 1): số liệu tổng, tổng quan trạng
 * thái của Equipment / Calibration / Golden (tô bằng màu trạng thái admin chọn),
 * thiết bị quá hạn / sắp đến hạn hiệu chuẩn, phân bố theo vị trí / loại, và
 * "Thay đổi gần đây" (view recent_activities) có bộ lọc.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Cpu, Gauge, CircuitBoard, TriangleAlert, Users } from 'lucide-react';
import { api, ApiError, formatTime } from '@/lib/client/api';
import { translateError } from '@/lib/i18n/errors';
import { useCan } from '@/components/ViewerContext';
import { Button, ErrorState, Notice, Skeleton, Spinner } from '@/components/ui';
import { PageHeading } from '@/components/layout/PageHeading';
import { DueDate } from '@/components/ui/tags';
import { HistoryChanges, useFormatNote } from '@/components/ui/detail/DetailHistory';
import type { CountItem, DashboardData, HistoryModule, RecentActivity, StatusCountItem, StatusPage } from '@/lib/types';

const MODULE_PATH: Record<HistoryModule, string | null> = {
  // Lịch sử hiệu chuẩn trỏ về equipment_id → mở thiết bị (nhóm Hiệu chuẩn nằm trong đó).
  equipment: '/equipment', calibration: '/equipment', golden_sample: '/golden', configuration: null, user: '/users',
};

const STATUS_PAGES: { page: StatusPage; href: string }[] = [
  { page: 'equipment', href: '/equipment' },
  { page: 'calibration', href: '/calibration' },
  { page: 'golden_sample', href: '/golden' },
];

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const can = useCan();
  const denied = useSearchParams().get('denied') === '1';
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<DashboardData>('/api/dashboard').then((r) => setData(r.data)).catch((e) => { if (e instanceof ApiError) setError(e); });
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="dash">
      <PageHeading title={t('nav.dashboard')} />
      {denied && <Notice tone="warn">{t('dash.denied')}</Notice>}
      {error ? <ErrorState message={translateError(error.code, language, error.message)} onRetry={load} /> : (
        <>
          <div className="dash-kpis">
            <Kpi icon={<Cpu size={16} />} label={t('dash.equipment')} value={data?.equipment_total} href="/equipment" />
            <Kpi icon={<Gauge size={16} />} label={t('dash.calibration')} value={data?.calibration_total} href="/calibration" />
            <Kpi icon={<TriangleAlert size={16} />} label={t('cal.due.overdue')} value={data?.overdue.length} tone="alert" href="/calibration" />
            <Kpi icon={<CalendarClock size={16} />} label={t('cal.due.due_soon')} value={data?.due_soon.length} tone="warn" href="/calibration" />
            <Kpi icon={<CircuitBoard size={16} />} label={t('dash.golden')} value={data?.golden_total} href="/golden" />
            {can.admin && <Kpi icon={<Users size={16} />} label={t('dash.pendingUsers')} value={data?.pending_users ?? 0} href="/users" />}
          </div>

          <StatusOverview data={data?.by_status} />

          <div className="dash-grid">
            <DueList title={t('dash.overdueTitle')} rows={data?.overdue} empty={t('dash.noneOverdue')} />
            <DueList title={t('dash.dueSoonTitle')} rows={data?.due_soon} empty={t('dash.noneDueSoon')} />
          </div>

          <div className="dash-grid">
            <Bars title={t('dash.byLocation')} items={data?.by_location} total={data?.equipment_total} />
            <Bars title={t('dash.byType')} items={data?.by_type} total={data?.equipment_total} />
          </div>

          <RecentActivities />
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone, href }: { icon: React.ReactNode; label: string; value: number | undefined; tone?: 'alert' | 'warn'; href: string }) {
  return (
    <Link href={href} className="kpi" data-tone={value ? tone : undefined}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <span className="kpi-value">{value === undefined ? <Skeleton className="h-7" style={{ width: 48 }} /> : value}</span>
      <span className="kpi-label">{label}</span>
    </Link>
  );
}

function DueList({ title, rows, empty }: { title: string; rows: DashboardData['overdue'] | undefined; empty: string }) {
  const { t } = useTranslation();
  return (
    <section className="dash-card">
      <h2>{title}{rows && <span className="dash-card-count">{rows.length}</span>}</h2>
      {!rows ? <Spinner label={t('common.loadingEllipsis')} size="sm" /> : rows.length === 0 ? <p className="dash-empty">{empty}</p> : (
        <ul className="dash-due">
          {rows.slice(0, 15).map((r) => (
            <li key={r.id}>
              <Link href={`/calibration?id=${r.id}`}>
                <strong>{r.serial_number}</strong>
                <span className="dash-due-meta">{[r.part_number, r.location].filter(Boolean).join(' · ')}</span>
                <DueDate date={r.due_date} state={r.due_state} />
              </Link>
            </li>
          ))}
          {rows.length > 15 && <li className="dash-more"><Link href="/calibration">{t('dash.viewAll', { count: rows.length })}</Link></li>}
        </ul>
      )}
    </section>
  );
}

/** Mỗi trang dùng trạng thái: thanh xếp chồng tô màu trạng thái + chú thích có số (đọc được không cần màu). */
function StatusOverview({ data }: { data: DashboardData['by_status'] | undefined }) {
  const { t } = useTranslation();
  return (
    <section className="dash-card">
      <h2>{t('dash.byStatus')}</h2>
      {!data ? <Spinner label={t('common.loadingEllipsis')} size="sm" /> : (
        <div className="dash-status">
          {STATUS_PAGES.map(({ page, href }) => <StatusBreakdown key={page} page={page} href={href} items={data[page]} />)}
        </div>
      )}
    </section>
  );
}

function StatusBreakdown({ page, href, items }: { page: StatusPage; href: string; items: StatusCountItem[] }) {
  const { t } = useTranslation();
  const moduleName = t(`dash.moduleName.${page}`);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const label = (item: StatusCountItem) => item.label ?? t('dash.unset');
  const percent = (count: number) => (total ? Math.round((count / total) * 100) : 0);
  return (
    <div className="dash-status-module">
      <div className="dash-status-head">
        <Link className="link" href={href}>{moduleName}</Link>
        <span className="dash-status-total">{total}</span>
      </div>
      {total === 0 ? <p className="dash-empty">{t('dash.noData')}</p> : (
        <>
          <div className="dash-stack" role="img"
            aria-label={t('dash.statusOf', { module: moduleName, summary: items.map((i) => `${label(i)} ${i.count}`).join(', ') })}>
            {items.map((item) => (
              <span key={item.id ?? 'none'} className="dash-stack-seg" data-status-color={item.color ?? undefined}
                style={{ flexGrow: item.count }} title={`${label(item)}: ${item.count} (${percent(item.count)}%)`} />
            ))}
          </div>
          <ul className="dash-legend">
            {items.map((item) => (
              <li key={item.id ?? 'none'}>
                <span className="status-dot" data-status-color={item.color ?? undefined} aria-hidden="true" />
                <span className="dash-legend-label">{label(item)}</span>
                <span className="dash-legend-count">{item.count}</span>
                <span className="dash-legend-pct">{percent(item.count)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Bars({ title, items, total }: { title: string; items: CountItem[] | undefined; total: number | undefined }) {
  const { t } = useTranslation();
  return (
    <section className="dash-card">
      <h2>{title}</h2>
      {!items ? <Spinner label={t('common.loadingEllipsis')} size="sm" /> : items.length === 0 ? <p className="dash-empty">{t('dash.noData')}</p> : (
        <ul className="dash-bars">
          {items.slice(0, 8).map((item) => (
            <li key={item.id ?? 'none'}>
              <span className="dash-bar-label">{item.label ?? t('dash.unset')}</span>
              <span className="dash-bar-track"><span className="dash-bar-fill" style={{ width: `${total ? (item.count / total) * 100 : 0}%` }} /></span>
              <span className="dash-bar-count">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivities() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const can = useCan();
  const formatNote = useFormatNote();
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [rows, setRows] = useState<RecentActivity[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (module) params.set('module', module);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setError(null);
    api.get<RecentActivity[]>(`/api/dashboard/activities?${params}`).then((r) => setRows(r.data)).catch((e) => { if (e instanceof ApiError) setError(e); });
  }, [module, from, to, limit]);
  useEffect(() => { load(); }, [load]);

  const modules: HistoryModule[] = can.admin
    ? ['equipment', 'calibration', 'golden_sample', 'configuration', 'user']
    : ['equipment', 'calibration', 'golden_sample'];
  const fieldLabel = (key: string) => t(`fields.${key}`, { defaultValue: key });

  return (
    <section className="dash-card dash-activity">
      <div className="dash-activity-head">
        <h2>{t('dash.recent')}</h2>
        <div className="dash-activity-filters">
          <select value={module} onChange={(e) => setModule(e.target.value)} aria-label={t('dash.module')}>
            <option value="">{t('dash.allModules')}</option>
            {modules.map((m) => <option key={m} value={m}>{t(`dash.moduleName.${m}`)}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('dash.from')} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('dash.to')} />
        </div>
      </div>
      {error ? <ErrorState message={translateError(error.code, language, error.message)} onRetry={load} />
        : !rows ? <Spinner label={t('common.loadingEllipsis')} size="sm" />
          : rows.length === 0 ? <p className="dash-empty">{t('hist.empty')}</p> : (
            // Danh sách cuộn bên trong thẻ (JABIL_UI.md mục 4), cuộn được bằng bàn phím.
            <ol className="hist-list" tabIndex={0} aria-label={t('dash.recent')}>
              {rows.map((r) => {
                const path = MODULE_PATH[r.module];
                return (
                  <li key={r.id} className="hist-item">
                    <div className="hist-head">
                      <span className="tag" data-tone="info">{t(`dash.moduleName.${r.module}`)}</span>
                      <span className="hist-action">{t(`hist.action.${r.action}`, { defaultValue: r.action })}</span>
                      {path ? <Link className="link" href={`${path}?id=${r.object_id}`}>{r.label}</Link> : <strong>{r.label}</strong>}
                      <time className="hist-time" dateTime={r.created_at}>{formatTime(r.created_at)}</time>
                    </div>
                    <div className="hist-by">{r.created_by_name ?? t('hist.system')}</div>
                    {formatNote(r.note) && <div className="hist-note">{formatNote(r.note)}</div>}
                    <HistoryChanges changes={r.changes} fieldLabel={fieldLabel} />
                  </li>
                );
              })}
            </ol>
          )}
      {rows && rows.length >= limit && limit < 500 && (
        <Button size="sm" onClick={() => setLimit((l) => Math.min(l + 100, 500))}>{t('dash.loadMore')}</Button>
      )}
    </section>
  );
}
