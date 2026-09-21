'use client';

/**
 * Dashboard — the main monitoring / overview page. Distinct purpose from
 * the Masterlist: this answers "what's the overall equipment situation and
 * what needs attention today", the Masterlist is the detailed record table.
 * Every meaningful number here is a drill-down link into the Masterlist
 * with the matching filter pre-applied (see the `go()` helper below) —
 * never a decorative statistic.
 *
 * Data comes from one aggregated `/api/dashboard` call (grouped COUNTs
 * server-side, see lib/services/dashboard.ts) so this stays fast regardless
 * of how large the equipment table grows — it never fetches full rows just
 * to count them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Boxes, CalendarClock, CheckCircle2, ClipboardList,
  MapPin, ShieldAlert, Wrench, XCircle,
} from 'lucide-react';
import { api, ApiError, formatDate, formatTime, type MasterDataRef } from '@/lib/client/api';
import { Button, ErrorState, Notice, Skeleton } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { translateError } from '@/lib/i18n/errors';
import { PageHeading } from '@/components/layout/PageHeading';
import { KpiCard, BarList, DashboardSection, type BarDatum } from './DashboardPrimitives';
import type { AttentionRow, OpenRepairRow, ActivityRow } from '@/lib/services/dashboard';

type DashboardSummary = {
  total: number;
  by_status: { id: string | null; code: string | null; label: string; count: number }[];
  by_type: { id: string | null; code: string | null; label: string; count: number }[];
  by_location: { id: string | null; label: string; count: number }[];
  calibration: Record<string, number> & { due_soon_days: number };
  repair: { open: number; internal_open: number; vendor_open: number };
};

type DashboardPayload = {
  summary: DashboardSummary;
  calibrationAttention: AttentionRow[];
  openRepairs: OpenRepairRow[];
  recentActivity: ActivityRow[];
};

const ACTION_ICONS: Record<string, typeof ClipboardList> = {
  CREATE: ClipboardList, MOVE: MapPin, MOVE_CASCADE: MapPin, SWAP: Boxes,
  DETACH: Boxes, ARCHIVE: XCircle, RESTORE: CheckCircle2, UPDATE: ClipboardList, CHANGE_LOCATION: MapPin,
};

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [types, setTypes] = useState<MasterDataRef[]>([]);
  const [locations, setLocations] = useState<{ id: string; code: string }[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void api.get<{ types: MasterDataRef[]; statuses: MasterDataRef[]; levels: MasterDataRef[] }>('/api/master-data')
      .then((r) => setTypes(r.data.types));
    void api.get<{ id: string; code: string }[]>('/api/locations').then((r) => setLocations(r.data));
  }, []);

  const load = useCallback(async () => {
    // A Type/Location change fires a new fetch before an older one might
    // resolve — cancel the older one so it can't land after and overwrite
    // this one's (still-visible) data with stale results.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (typeFilter) q.set('typeId', typeFilter);
      if (locationFilter) q.set('locationId', locationFilter);
      const res = await api.get<DashboardPayload>(`/api/dashboard?${q}`, { signal: controller.signal });
      setData(res.data);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError) setError(e);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [typeFilter, locationFilter]);

  useEffect(() => { void load(); }, [load]);

  function go(params: Record<string, string>) {
    const q = new URLSearchParams(params);
    router.push(`/equipment?${q}`);
  }

  // A failed refresh never blanks a dashboard that's already showing
  // something — the banner sits above the (still-visible, now slightly
  // stale) content, and only replaces the page with ErrorState+Retry when
  // there was nothing to show in the first place.
  if (error && !data) {
    return (
      <div className="dashboard-page">
        <PageHeading title={t('nav.dashboard')} subtitle={t('dashboardPage.subtitle')} />
        <ErrorState message={translateError(error.code, language, error.message)} onRetry={() => void load()} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="dashboard-page">
        <PageHeading title={t('nav.dashboard')} subtitle={t('dashboardPage.subtitle')} />
        <div className="dashboard-kpi-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="dashboard-grid-2" aria-hidden="true">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const { summary, calibrationAttention, openRepairs, recentActivity } = data;
  const overdue = summary.calibration.OVERDUE ?? 0;
  const dueSoon = summary.calibration.DUE_SOON ?? 0;
  const notCalibrated = summary.calibration.NOT_CALIBRATED ?? 0;
  const valid = summary.calibration.VALID ?? 0;
  const needsAttention = overdue + notCalibrated + summary.repair.open;

  const statusBars: BarDatum[] = summary.by_status.map((s) => ({
    key: s.id ?? 'none', label: s.label, count: s.count,
    onClick: s.id ? () => go({ statusId: s.id! }) : undefined,
  }));
  const typeBars: BarDatum[] = summary.by_type.map((s) => ({
    key: s.id ?? 'none', label: s.label, count: s.count,
    onClick: s.id ? () => go({ typeId: s.id! }) : undefined,
  }));
  const locationBars: BarDatum[] = summary.by_location.map((s) => ({
    key: s.id ?? 'none', label: s.label, count: s.count,
    onClick: s.id ? () => go({ locationId: s.id! }) : undefined,
  }));

  return (
    <div className="dashboard-page">
      <PageHeading
        title={t('nav.dashboard')}
        subtitle={t('dashboardPage.subtitle')}
        actions={
          <div className="dashboard-filters-inline">
            {loading && <span className="text-[12px]" style={{ color: 'var(--ink-3)' }} role="status">{t('dashboardPage.refreshing')}</span>}
            <SearchableSelect
              value={typeFilter} onChange={setTypeFilter} clearable ariaLabel={t('dashboard.type')}
              placeholder={t('dashboard.allTypes')}
              options={types.map((o) => ({ value: o.id, label: o.display_name }))}
              className="border px-2 py-1.5 text-[12px]" style={{ borderColor: 'var(--rule)' }}
            />
            <SearchableSelect
              value={locationFilter} onChange={setLocationFilter} clearable ariaLabel={t('dashboard.location')}
              placeholder={t('dashboard.allLocations')}
              options={locations.map((o) => ({ value: o.id, label: o.code }))}
              className="border px-2 py-1.5 text-[12px]" style={{ borderColor: 'var(--rule)' }}
            />
          </div>
        }
      />

      {error && <div className="mb-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>}

      <div className="dashboard-kpi-grid">
        <KpiCard label={t('dashboardPage.totalEquipment')} value={summary.total} icon={<Boxes size={18} />} onClick={() => go(typeFilter || locationFilter ? { ...(typeFilter && { typeId: typeFilter }), ...(locationFilter && { locationId: locationFilter }) } : {})} />
        <KpiCard label={t('dashboardPage.needsAttention')} value={needsAttention} tone={needsAttention > 0 ? 'alert' : 'ok'} icon={<AlertTriangle size={18} />} />
        <KpiCard label={t('dashboardPage.underRepair')} value={summary.repair.open} tone={summary.repair.open > 0 ? 'warn' : 'neutral'} icon={<Wrench size={18} />} onClick={() => go({ underRepair: 'true' })} />
        <KpiCard label={t('calibration.state.OVERDUE')} value={overdue} tone={overdue > 0 ? 'alert' : 'ok'} icon={<XCircle size={18} />} onClick={() => go({ calibrationStatus: 'OVERDUE' })} />
        <KpiCard label={t('calibration.state.DUE_SOON')} value={dueSoon} tone={dueSoon > 0 ? 'warn' : 'neutral'} icon={<CalendarClock size={18} />} onClick={() => go({ calibrationStatus: 'DUE_SOON' })} />
        <KpiCard label={t('calibration.state.NOT_CALIBRATED')} value={notCalibrated} tone={notCalibrated > 0 ? 'alert' : 'ok'} icon={<ShieldAlert size={18} />} onClick={() => go({ calibrationStatus: 'NOT_CALIBRATED' })} />
      </div>

      <div className="dashboard-grid-2">
        <DashboardSection title={t('dashboard.status')}>
          <BarList data={statusBars} total={summary.total} emptyLabel={t('dashboard.noEquipmentYet')} />
        </DashboardSection>
        <DashboardSection title={t('dashboardPage.calibrationHealth')}>
          <div className="calibration-health-grid">
            <button type="button" className="calibration-health-cell" data-tone="alert" onClick={() => go({ calibrationStatus: 'OVERDUE' })}>
              <span className="calibration-health-value">{overdue}</span><span>{t('calibration.state.OVERDUE')}</span>
            </button>
            <button type="button" className="calibration-health-cell" data-tone="warn" onClick={() => go({ calibrationStatus: 'DUE_SOON' })}>
              <span className="calibration-health-value">{dueSoon}</span><span>{t('calibration.state.DUE_SOON')}</span>
            </button>
            <button type="button" className="calibration-health-cell" data-tone="alert" onClick={() => go({ calibrationStatus: 'NOT_CALIBRATED' })}>
              <span className="calibration-health-value">{notCalibrated}</span><span>{t('calibration.state.NOT_CALIBRATED')}</span>
            </button>
            <button type="button" className="calibration-health-cell" data-tone="ok" onClick={() => go({ calibrationStatus: 'VALID' })}>
              <span className="calibration-health-value">{valid}</span><span>{t('calibration.state.VALID')}</span>
            </button>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('dashboardPage.dueSoonWindowNote', { days: summary.calibration.due_soon_days })}</p>
        </DashboardSection>
      </div>

      <div className="dashboard-grid-2">
        <DashboardSection title={t('dashboard.type')}>
          <BarList data={typeBars} total={summary.total} emptyLabel={t('dashboard.noEquipmentYet')} />
        </DashboardSection>
        <DashboardSection title={t('dashboard.location')}>
          <BarList data={locationBars} total={summary.total} emptyLabel={t('dashboard.noEquipmentYet')} />
        </DashboardSection>
      </div>

      <DashboardSection
        title={t('dashboardPage.calibrationAttention')}
        action={<Button size="sm" onClick={() => go({ calibrationStatus: 'OVERDUE' })}>{t('dashboardPage.viewAll')}</Button>}
      >
        {calibrationAttention.length === 0 ? (
          <p className="py-6 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('dashboardPage.noCalibrationAttention')}</p>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th>{t('dashboard.serial')}</th>
                <th>{t('dashboard.type')}</th>
                <th>{t('dashboard.location')}</th>
                <th>{t('common.status')}</th>
                <th>{t('calibration.dueDate')}</th>
              </tr>
            </thead>
            <tbody>
              {calibrationAttention.map((r) => (
                <tr key={r.equipment_id} className="cursor-pointer" onClick={() => go({ equipmentId: r.equipment_id })}>
                  <td className="ident font-medium">{r.serial_number}</td>
                  <td>{r.type_label ?? '—'}</td>
                  <td>{r.location_label ?? '—'}</td>
                  <td><span className="equipment-status" data-status={r.calibration_status.toLowerCase()}>{t(`calibration.state.${r.calibration_status}`)}</span></td>
                  <td className="ident">{r.calibration_status === 'NOT_CALIBRATED' ? t('calibration.state.NOT_CALIBRATED') : formatDate(r.calibration_due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardSection>

      <div className="dashboard-grid-2">
        <DashboardSection title={t('dashboardPage.currentRepair')} action={<Button size="sm" onClick={() => go({ underRepair: 'true' })}>{t('dashboardPage.viewAll')}</Button>}>
          {openRepairs.length === 0 ? (
            <p className="py-6 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('repair.noHistory')}</p>
          ) : (
            <ul className="dashboard-activity-list">
              {openRepairs.map((r) => (
                <li key={`${r.equipment_id}-${r.repair_start_date}`} className="cursor-pointer" onClick={() => go({ equipmentId: r.equipment_id })}>
                  <span className="dashboard-activity-icon"><Wrench size={13} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]"><span className="ident font-medium">{r.serial_number}</span> · {r.repair_type === 'vendor' ? t('repair.vendorRepair') : t('repair.internalRepair')}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{r.problem ?? r.location_label ?? '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
        <DashboardSection title={t('dashboardPage.recentActivity')}>
          {recentActivity.length === 0 ? (
            <p className="py-6 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('dashboardPage.noRecentActivity')}</p>
          ) : (
            <ul className="dashboard-activity-list">
              {recentActivity.map((a) => {
                const Icon = ACTION_ICONS[a.action] ?? ClipboardList;
                return (
                  <li key={a.id}>
                    <span className="dashboard-activity-icon"><Icon size={13} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]">{a.note ?? a.action}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {a.actor_name ? t('equipmentDetail.historyBy', { name: a.actor_name }) + ' · ' : ''}{formatTime(a.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
