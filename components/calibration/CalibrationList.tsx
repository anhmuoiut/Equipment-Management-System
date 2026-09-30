'use client';

/**
 * Calibration — every active piece of equipment that requires calibration,
 * most urgent first (Overdue → Not calibrated → Due soon → Valid, each by
 * due date). State comes from the same derived equipment_calibration_status
 * view the Dashboard and the notification bell read, so the three never
 * disagree; this page adds what those can't show at list scale — last
 * calibration, due date with the days left, and who calibrated it.
 *
 * Opening a row shows the shared equipment detail on its Calibration tab,
 * which is where a record is added or corrected (gated there by
 * calibration.create / calibration.update) — this page itself never writes.
 *
 * Status, search and page live in the URL (?status=&search=&page=) so a
 * filtered view can be bookmarked or linked to.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, Search, ShieldAlert, XCircle, type LucideIcon } from 'lucide-react';
import {
  api, ApiError, formatDate,
  type FieldDefinition, type LocationRef, type MasterDataRef, type StatusRef,
} from '@/lib/client/api';
import { Button, EmptyState, ErrorState, Notice, TableSkeleton } from '@/components/ui';
import { PageHeading } from '@/components/layout/PageHeading';
import { translateError } from '@/lib/i18n/errors';
import { ADMIN_SECTION_PATHS, canAccessAdminSection } from '@/lib/permissions';
import { EquipmentDetailModal, type Me } from '@/components/equipment/EquipmentDetailModal';
import { EquipmentDetailOverlay } from '@/components/equipment/EquipmentDetailOverlay';
import type {
  CalibrationListStatus, CalibrationOverviewCounts, CalibrationOverviewRow,
} from '@/lib/services/calibration';

const PAGE_SIZE = 50;

type Tone = 'alert' | 'warn' | 'ok';

/** Filter order follows the Dashboard's calibration cards. */
const FILTERS: { status: CalibrationListStatus; icon: LucideIcon; tone: Tone }[] = [
  { status: 'OVERDUE', icon: XCircle, tone: 'alert' },
  { status: 'DUE_SOON', icon: CalendarClock, tone: 'warn' },
  { status: 'NOT_CALIBRATED', icon: ShieldAlert, tone: 'alert' },
  { status: 'VALID', icon: CheckCircle2, tone: 'ok' },
];
const LIST_STATUSES = new Set<string>(FILTERS.map((filter) => filter.status));

type Reference = {
  me: Me; fields: FieldDefinition[]; locations: LocationRef[];
  types: MasterDataRef[]; levels: MasterDataRef[]; statuses: StatusRef[];
};

export function CalibrationList() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const router = useRouter();
  const searchParams = useSearchParams();

  // Seeded from the URL once; the fetch effect below writes changes back.
  const [status, setStatus] = useState<CalibrationListStatus | ''>(() => {
    const value = searchParams.get('status') ?? '';
    return LIST_STATUSES.has(value) ? value as CalibrationListStatus : '';
  });
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));

  const [rows, setRows] = useState<CalibrationOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<CalibrationOverviewCounts | null>(null);
  const [dueSoonDays, setDueSoonDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [referenceError, setReferenceError] = useState<ApiError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The equipment detail needs the same reference data the Masterlist
  // loads — fetched once, not on every filter change.
  useEffect(() => {
    void (async () => {
      try {
        const [meRes, fieldRes, locRes, masterRes] = await Promise.all([
          api.get<Me>('/api/me'),
          api.get<{ fields: FieldDefinition[]; editable_fields: string[] }>('/api/fields'),
          api.get<LocationRef[]>('/api/locations'),
          api.get<{ types: MasterDataRef[]; statuses: StatusRef[]; levels: MasterDataRef[] }>('/api/master-data'),
        ]);
        setReference({
          me: meRes.data, fields: fieldRes.data.fields, locations: locRes.data,
          types: masterRes.data.types, levels: masterRes.data.levels, statuses: masterRes.data.statuses,
        });
      } catch (e) {
        if (e instanceof ApiError) setReferenceError(e);
      }
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    // A newer filter/search supersedes an in-flight request — cancel it so
    // its now-stale response can't land after and overwrite this one's.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) q.set('status', status);
      if (search.trim()) q.set('search', search.trim());
      const res = await api.get<CalibrationOverviewRow[]>(`/api/calibration?${q}`, { signal: controller.signal });
      setRows(res.data);
      setTotal(Number(res.meta.total ?? 0));
      setCounts(res.meta.counts as CalibrationOverviewCounts);
      setDueSoonDays(typeof res.meta.due_soon_days === 'number' ? res.meta.due_soon_days : null);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError) setError(e);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [page, status, search]);

  // Typing waits for a pause; a status or page change fetches at once. The
  // URL follows with replace (not push), so filtering doesn't add a history
  // entry per keystroke — and isn't rewritten when it already matches.
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRows();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (page > 1) params.set('page', String(page));
      const qs = params.toString();
      const next = qs ? `/calibration?${qs}` : '/calibration';
      if (next !== window.location.pathname + window.location.search) router.replace(next, { scroll: false });
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [fetchRows, search, status, page, router]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A bookmarked ?page= past the end (the list has shrunk since) lands on
  // the last page instead of an empty one.
  useEffect(() => {
    if (!loading && page > lastPage) setPage(lastPage);
  }, [loading, page, lastPage]);

  // "/" jumps to search, as on the Masterlist.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Pressing the active status again returns to All (it's a toggle button). */
  function toggleStatus(next: CalibrationListStatus | '') {
    setStatus((current) => (current === next ? '' : next));
    setPage(1);
  }

  function clearFilters() {
    setStatus('');
    setSearch('');
    setPage(1);
  }

  function dueRelative(row: CalibrationOverviewRow): { text: string; tone?: Tone } | null {
    const days = row.days_until_due;
    if (days === null) return null;
    if (days < 0) return { text: t('calibrationPage.overdueBy', { count: -days }), tone: 'alert' };
    if (days === 0) return { text: t('calibrationPage.dueToday'), tone: 'warn' };
    return { text: t('calibrationPage.dueIn', { count: days }), tone: row.calibration_status === 'DUE_SOON' ? 'warn' : undefined };
  }

  const hasFilter = status !== '' || search.trim() !== '';
  const canChangeWindow = !!reference
    && canAccessAdminSection(reference.me.role, reference.me.permissions, 'calibrationSettings');
  const openRow = openId ? rows.find((row) => row.equipment_id === openId) : undefined;

  return (
    <div className="dashboard">
      <section ref={contentRef} aria-labelledby="calibration-title" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeading id="calibration-title" title={t('calibrationPage.title')} subtitle={t('calibrationPage.subtitle')} />

        <div className="equipment-panel">
          <div className="equipment-toolbar-wrap">
            <div className="equipment-toolbar">
              <div className="calibration-filter" role="group" aria-label={t('calibrationPage.statusFilter')}>
                <button type="button" aria-pressed={status === ''} onClick={() => toggleStatus('')}>
                  {t('calibrationPage.all')}
                  <span className="calibration-filter-count">{counts?.ALL ?? '–'}</span>
                </button>
                {FILTERS.map(({ status: value, icon: Icon, tone }) => (
                  <button
                    key={value} type="button" data-tone={tone}
                    aria-pressed={status === value} onClick={() => toggleStatus(value)}
                    title={value === 'DUE_SOON' && dueSoonDays !== null
                      ? t('calibrationPage.dueSoonWindow', { days: dueSoonDays }) : undefined}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {t(`calibration.state.${value}`)}
                    <span className="calibration-filter-count">{counts?.[value] ?? '–'}</span>
                  </button>
                ))}
              </div>
              <div className="equipment-search">
                <div className="equipment-search-combined">
                  <Search size={15} aria-hidden="true" className="equipment-search-icon" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    aria-label={t('calibrationPage.searchLabel')} placeholder={t('calibrationPage.searchPlaceholder')}
                    className="equipment-search-input"
                  />
                </div>
              </div>
              <div className="equipment-toolbar-actions">
                <span className="equipment-record-count" role="status">
                  {loading ? t('common.loadingEllipsis') : total + ' ' + t('dashboard.records')}
                </span>
                {hasFilter && <Button size="sm" onClick={clearFilters}>{t('dashboard.clearFilters')}</Button>}
              </div>
            </div>
          </div>

          {referenceError && (
            <div className="px-4 pt-3"><Notice tone="alert" onDismiss={() => setReferenceError(null)}>{translateError(referenceError.code, language, referenceError.message)}</Notice></div>
          )}
          {/* A failed refresh never blanks rows already on screen — same as the Masterlist. */}
          {error && rows.length > 0 && (
            <div className="px-4 pt-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>
          )}

          <div className="equipment-scroll" aria-busy={loading || undefined}>
            {error && rows.length === 0 ? (
              <ErrorState message={translateError(error.code, language, error.message)} onRetry={() => void fetchRows()} />
            ) : loading && rows.length === 0 ? (
              <table className="grid-table calibration-table">
                <CalibrationHead />
                <tbody><TableSkeleton columns={8} /></tbody>
              </table>
            ) : rows.length === 0 ? (
              counts?.ALL === 0 && !search.trim() ? (
                <EmptyState title={t('calibrationPage.noneRequired')} subtitle={t('calibrationPage.noneRequiredHint')} />
              ) : (
                <EmptyState
                  title={t('calibrationPage.noMatches')}
                  subtitle={t('dashboard.tryClearingFilter')}
                  action={<Button size="sm" onClick={clearFilters}>{t('dashboard.clearFilters')}</Button>}
                />
              )
            ) : (
              <table className="grid-table calibration-table" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
                <CalibrationHead />
                <tbody>
                  {rows.map((row) => {
                    const relative = dueRelative(row);
                    return (
                      <tr
                        key={row.equipment_id}
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => setOpenId(row.equipment_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenId(row.equipment_id);
                          }
                        }}
                        aria-label={t('calibrationPage.openCalibrationFor') + ' ' + row.serial_number}
                        style={openId === row.equipment_id ? { background: 'var(--machine-tint)' } : undefined}
                      >
                        <td className="col-status">
                          <span className="equipment-status" data-status={row.calibration_status.toLowerCase()}>
                            {t(`calibration.state.${row.calibration_status}`)}
                          </span>
                        </td>
                        <td className="col-part ident" style={{ color: 'var(--ink-2)' }}>{row.part_number ?? '—'}</td>
                        <td className="col-serial ident font-medium">{row.serial_number}</td>
                        <td className="col-types" style={{ color: 'var(--ink-2)' }}>{row.type_label ?? '—'}</td>
                        <td className="col-location">{row.location_label ?? '—'}</td>
                        <td className="col-last ident" style={{ color: 'var(--ink-2)' }}>{formatDate(row.last_calibration_date)}</td>
                        <td className="col-due ident">
                          <span className="calibration-due">
                            <span>{formatDate(row.calibration_due_date)}</span>
                            {relative && <span className="calibration-due-relative" data-tone={relative.tone}>{relative.text}</span>}
                          </span>
                        </td>
                        <td className="col-by" style={{ color: 'var(--ink-2)' }}>{row.last_calibrated_by ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="dashboard-footer">
            <span>
              {t('dashboard.showing')} {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} {t('dashboard.of')} {total} {t('dashboard.records')}
              {dueSoonDays !== null && (
                <span className="calibration-window-note">
                  {' · '}{t('calibrationPage.dueSoonWindow', { days: dueSoonDays })}
                  {canChangeWindow && <>{' '}<Link href={ADMIN_SECTION_PATHS.calibrationSettings}>{t('calibrationPage.changeWindow')}</Link></>}
                </span>
              )}
            </span>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('dashboard.previous')}</Button>
              <span>{t('dashboard.page')} {page} / {lastPage}</span>
              <Button size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>{t('dashboard.next')}</Button>
            </div>
          </div>
        </div>
      </section>

      {openId && reference && (
        <EquipmentDetailOverlay
          label={t('dashboard.equipmentDetails') + ': ' + (openRow?.serial_number ?? '')}
          focusKey={openId}
          backgroundRef={contentRef}
          onClose={() => setOpenId(null)}
        >
          <EquipmentDetailModal
            key={openId}
            id={openId}
            me={reference.me}
            fields={reference.fields}
            locations={reference.locations}
            equipmentTypes={reference.types}
            equipmentLevels={reference.levels}
            equipmentStatuses={reference.statuses}
            initialMode="view"
            initialTab="calibration"
            onClose={() => setOpenId(null)}
            onChanged={() => void fetchRows()}
            onOpenOther={(id) => setOpenId(id)}
          />
        </EquipmentDetailOverlay>
      )}
    </div>
  );
}

function CalibrationHead() {
  const { t } = useTranslation();
  return (
    <thead>
      <tr>
        <th className="col-status">{t('common.status')}</th>
        <th className="col-part">Part number</th>
        <th className="col-serial">Serial number</th>
        <th className="col-types">{t('dashboard.type')}</th>
        <th className="col-location">{t('dashboard.location')}</th>
        <th className="col-last">{t('calibration.lastCalibrationDate')}</th>
        <th className="col-due">{t('calibration.dueDate')}</th>
        <th className="col-by">{t('calibration.calibratedBy')}</th>
      </tr>
    </thead>
  );
}
