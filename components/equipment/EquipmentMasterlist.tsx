'use client';

/**
 * Equipment masterlist.
 *
 * Shared by the active-equipment page (`/equipment`) and the archived-
 * equipment page (`/equipment/archived`, `archivedOnly`) — same table, same
 * detail popup, the only difference is which side of `archived_at` the list
 * is pinned to and whether Import/New equipment make sense to offer.
 *
 * Flat list, KHÔNG chèn duplicate child row. Quan hệ cha–con nằm ở popup chi
 * tiết (Hierarchy tab) — không có cột hay cờ riêng cho việc đó ở đây nữa, để
 * hàng gọn hơn.
 *
 * Search/filter/sort/pagination đều server-side. Type/Status/Level/Location
 * filters load their option lists from V2 master data (never hardcoded) —
 * see the /api/master-data bootstrap call below.
 *
 * Row click only ever opens read-only — EquipmentDetailModal starts in 'view' mode
 * and requires its own Edit button before any field becomes writable. Every
 * CRUD action (edit, archive, restore, move, swap, detach) lives inside that
 * popup instead of as a per-row button here — gated the same way there by
 * the signed-in user's own permissions, so removing the row-level buttons
 * doesn't remove anyone's access, just where they reach it from.
 *
 * Dashboard drill-down: a KPI card links here with query params
 * (statusId/typeId/levelId/locationId/calibrationStatus/underRepair) which
 * seed the filter state on mount — see the initial-URL read effect below.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  api, ApiError,
  type Equipment, type FieldDefinition, type LocationRef, type MasterDataRef, type StatusRef,
} from '@/lib/client/api';
import { Button, EmptyState, ErrorState, Notice, Tag, TableSkeleton, toast } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';
import { EquipmentDetailModal, hasPermission, type Me } from '@/components/equipment/EquipmentDetailModal';
import { CreateEquipmentModal } from '@/components/equipment/CreateEquipmentModal';
import { ImportEquipmentModal } from '@/components/equipment/ImportEquipmentModal';
import { EquipmentToolbar } from '@/components/equipment/EquipmentToolbar';
import { PageHeading } from '@/components/layout/PageHeading';

const PAGE_SIZE = 50;

type SortColumn =
  | 'status' | 'jabil_id' | 'part_number' | 'serial_number' | 'asset'
  | 'types' | 'level' | 'current_location_id' | 'remark' | 'parent';
type SortState = { column: SortColumn; direction: 'asc' | 'desc' } | null;

type OpenTarget = { id: string; mode: 'view' | 'edit' };

export function EquipmentMasterlist({ archivedOnly }: { archivedOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<MasterDataRef[]>([]);
  const [equipmentLevels, setEquipmentLevels] = useState<MasterDataRef[]>([]);
  const [equipmentStatuses, setEquipmentStatuses] = useState<StatusRef[]>([]);

  const [rows, setRows] = useState<Equipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [calibrationFilter, setCalibrationFilter] = useState('');
  const [underRepairFilter, setUnderRepairFilter] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [openTarget, setOpenTarget] = useState<OpenTarget | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchAbortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  // Guards the very first fetchRows run (see the syncUrl effect below): on
  // mount, the URL-seeding effect's setXFilter calls haven't landed in state
  // yet, so writing the URL on that first pass would wipe out the params it's
  // in the middle of reading (e.g. a Dashboard drill-down link or a QR
  // equipmentId deep link) before they ever take effect.
  const skippedFirstUrlSync = useRef(false);

  // Seed the whole list/filter state from the URL exactly once on mount —
  // covers both a Dashboard drill-down link (statusId/typeId/.../
  // equipmentId) and a bookmarked/shared/back-navigated masterlist URL
  // (page/search/sortBy/sortDir, written back out by the syncUrl effect
  // below), using the same key names both directions so either kind of link
  // round-trips.
  useEffect(() => {
    const sp = searchParams;
    if (sp.get('page')) setPage(Math.max(1, Number(sp.get('page')) || 1));
    if (sp.get('search')) setSearch(sp.get('search')!);
    const sortByRaw = sp.get('sortBy') as SortColumn | null;
    const sortDirRaw = sp.get('sortDir');
    if (sortByRaw && (sortDirRaw === 'asc' || sortDirRaw === 'desc')) {
      setSort({ column: sortByRaw, direction: sortDirRaw });
    }
    if (sp.get('statusId')) setStatusFilter(sp.get('statusId')!);
    if (sp.get('typeId')) setTypeFilter(sp.get('typeId')!);
    if (sp.get('levelId')) setLevelFilter(sp.get('levelId')!);
    if (sp.get('locationId')) setLocationFilter(sp.get('locationId')!);
    if (sp.get('calibrationStatus')) setCalibrationFilter(sp.get('calibrationStatus')!);
    if (sp.get('underRepair') === 'true') setUnderRepairFilter(true);
    if (!archivedOnly && sp.get('equipmentId')) setOpenTarget({ id: sp.get('equipmentId')!, mode: 'view' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openTarget || !me) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const content = contentRef.current;
    document.body.style.overflow = 'hidden';
    if (content) content.inert = true;
    detailRef.current?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !detailRef.current) return;
      if (event.target instanceof HTMLElement && event.target.closest('[data-action-dialog]')) return;
      const focusable = Array.from(detailRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      )).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === detailRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === detailRef.current)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      if (content) content.inert = false;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [openTarget, me]);

  // Bootstrap: metadata tải một lần, không tải lại theo từng lần lọc.
  useEffect(() => {
    void (async () => {
      try {
        const [meRes, fieldRes, locRes, masterRes] = await Promise.all([
          api.get<Me>('/api/me'),
          api.get<{ fields: FieldDefinition[]; editable_fields: string[] }>('/api/fields'),
          api.get<LocationRef[]>('/api/locations'),
          api.get<{ types: MasterDataRef[]; statuses: StatusRef[]; levels: MasterDataRef[] }>('/api/master-data'),
        ]);
        setMe({ ...meRes.data, editable_fields: meRes.data.editable_fields });
        setFields(fieldRes.data.fields);
        setLocations(locRes.data);
        setEquipmentTypes(masterRes.data.types);
        setEquipmentStatuses(masterRes.data.statuses);
        setEquipmentLevels(masterRes.data.levels);
      } catch (e) {
        if (e instanceof ApiError) setError(e);
      }
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    // A fast-typing search or quick filter changes can fire a new fetch
    // before an older one resolves — cancel the older one so its response
    // (now for stale params) can never land after and overwrite this one's.
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        showArchived: String(archivedOnly),
      });
      if (search.trim()) q.set('search', search.trim());
      if (sort) { q.set('sortBy', sort.column); q.set('sortDir', sort.direction); }
      if (typeFilter) q.set('filters[type_id]', typeFilter);
      if (statusFilter) q.set('filters[status_id]', statusFilter);
      if (levelFilter) q.set('filters[level_id]', levelFilter);
      if (locationFilter) q.set('filters[current_location_id]', locationFilter);
      if (calibrationFilter) q.set('calibrationStatus', calibrationFilter);
      if (underRepairFilter) q.set('underRepair', 'true');

      const res = await api.get<Equipment[]>(`/api/equipment?${q}`, { signal: controller.signal });
      setRows(res.data);
      setTotal(Number(res.meta.total ?? 0));
    } catch (e) {
      if (controller.signal.aborted) return; // superseded by a newer fetch — that one owns loading/error now
      if (e instanceof ApiError) setError(e);
    } finally {
      if (fetchAbortRef.current === controller) setLoading(false);
    }
  }, [page, search, sort, archivedOnly, typeFilter, statusFilter, levelFilter, locationFilter, calibrationFilter, underRepairFilter]);

  // Keeps page/search/sort/filters reflected in the URL (Section 36: a mid-
  // session filter combination should be bookmarkable/shareable/restorable
  // via Back, not just the one-time deep-link params the seed effect above
  // reads). Reuses the same key names that effect reads, so a copied URL
  // round-trips through both effects unchanged. router.replace (not push)
  // so filtering doesn't spam browser history with one entry per keystroke.
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (search.trim()) params.set('search', search.trim());
    if (sort) { params.set('sortBy', sort.column); params.set('sortDir', sort.direction); }
    if (typeFilter) params.set('typeId', typeFilter);
    if (statusFilter) params.set('statusId', statusFilter);
    if (levelFilter) params.set('levelId', levelFilter);
    if (locationFilter) params.set('locationId', locationFilter);
    if (calibrationFilter) params.set('calibrationStatus', calibrationFilter);
    if (underRepairFilter) params.set('underRepair', 'true');
    const qs = params.toString();
    const base = archivedOnly ? '/equipment/archived' : '/equipment';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [
    page, search, sort, typeFilter, statusFilter, levelFilter,
    locationFilter, calibrationFilter, underRepairFilter, archivedOnly, router,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRows();
      // Skip the mount-time pass — see skippedFirstUrlSync's declaration.
      if (skippedFirstUrlSync.current) syncUrl();
      else skippedFirstUrlSync.current = true;
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [fetchRows, search, syncUrl]);

  // Resetting page-to-1 used to be a reactive effect keyed on every filter's
  // state, but that can't tell "the user changed a filter" apart from "the
  // URL seed effect above just set one" — no amount of skip-the-first-N-
  // renders guarding resolves that cleanly, since the seed can land its
  // state update in a later commit than its own effect's first pass. Doing
  // it explicitly in each filter's own change handler (setFilter below)
  // sidesteps the ambiguity entirely: only a genuine user edit calls it.
  function setFilter<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  // "/" nhảy vào ô tìm kiếm — người dùng gõ serial cả ngày.
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

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The six advanced filters live behind the Filters dropdown and get their
  // own count badge there; search text is shown in its own visible input,
  // so it counts toward "any filter active" (for Clear filters) but not
  // toward the dropdown's badge count.
  const activeFilterCount = [typeFilter, statusFilter, levelFilter, locationFilter, calibrationFilter]
    .filter(Boolean).length + (underRepairFilter ? 1 : 0);
  const hasFilter = search.trim() !== '' || activeFilterCount > 0;

  function clearFilters() {
    setSearch('');
    setTypeFilter(''); setStatusFilter(''); setLevelFilter(''); setLocationFilter('');
    setCalibrationFilter(''); setUnderRepairFilter(false);
    setPage(1);
    // No direct router.replace needed here — the syncUrl effect picks up
    // these state changes and reduces the URL to its bare path on its own.
  }

  function toggleSort(column: SortColumn) {
    setSort((s) => {
      if (!s || s.column !== column) return { column, direction: 'asc' };
      if (s.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
    setPage(1);
  }

  /** Sortable header label — click cycles ascending → descending → off. */
  function sortHeader(column: SortColumn, label: ReactNode) {
    const active = sort?.column === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        title={t('dashboard.sortByColumn')}
        className="inline-flex items-center gap-1"
        style={{ color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
      >
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.45, fontSize: 9 }}>
          {active ? (sort!.direction === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    );
  }

  const titleId = archivedOnly ? 'archived-equipment-title' : 'equipment-masterlist-title';

  return (
    <div className="dashboard">
      <section ref={contentRef} aria-labelledby={titleId} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Previously lived in the header's own special two-row
            .topbar-page-heading (masterlist only) — moved into main
            content so every page uses the one shared PageHeading, and the
            header can drop back to its normal single-row height. */}
        <PageHeading
          id={titleId}
          title={archivedOnly ? t('archived.title') : t('dashboard.title')}
          subtitle={archivedOnly ? t('archived.subtitle') : t('dashboard.subtitle')}
        />

        <div className="equipment-panel">
          <EquipmentToolbar
            search={search} onSearchChange={(v) => setFilter(setSearch, v)}
            searchRef={searchRef}
            filters={{ typeFilter, statusFilter, levelFilter, locationFilter, calibrationFilter, underRepairFilter }}
            onTypeFilterChange={(v) => setFilter(setTypeFilter, v)}
            onStatusFilterChange={(v) => setFilter(setStatusFilter, v)}
            onLevelFilterChange={(v) => setFilter(setLevelFilter, v)}
            onLocationFilterChange={(v) => setFilter(setLocationFilter, v)}
            onCalibrationFilterChange={(v) => setFilter(setCalibrationFilter, v)}
            onUnderRepairFilterChange={(v) => setFilter(setUnderRepairFilter, v)}
            equipmentTypes={equipmentTypes} equipmentStatuses={equipmentStatuses}
            equipmentLevels={equipmentLevels} locations={locations}
            hasFilter={hasFilter} activeFilterCount={activeFilterCount} onClearFilters={clearFilters}
            loading={loading} total={total}
            canCreate={!!me && hasPermission(me, 'equipment.create')} archivedOnly={archivedOnly}
            onImport={() => setShowImport(true)} onCreate={() => setShowCreate(true)}
          />

          {/* A fetch failure never blanks rows already on screen — the banner
              sits above the (still-visible, now slightly stale) table, and
              only replaces the whole area with ErrorState+Retry when there
              was nothing to show in the first place. */}
          {error && rows.length > 0 && (
            <div className="px-4 pt-3"><Notice tone="alert" onDismiss={() => setError(null)}>{translateError(error.code, language, error.message)}</Notice></div>
          )}

          {/* bảng */}
          <div className="equipment-scroll" aria-busy={loading || undefined}>
            {error && rows.length === 0 ? (
              <ErrorState message={translateError(error.code, language, error.message)} onRetry={() => void fetchRows()} />
            ) : loading && rows.length === 0 ? (
              <table className="grid-table equipment-table">
                <thead>
                  <tr>
                    <th className="col-relation" style={{ width: 28 }} aria-label={t('dashboard.relationships')} />
                    <th className="col-no text-center" style={{ width: 44 }}>{t('dashboard.no')}</th>
                    <th className="col-status">{t('dashboard.status')}</th>
                    <th className="col-jabil">Jabil ID</th>
                    <th className="col-part">Part number</th>
                    <th className="col-serial">Serial number</th>
                    <th className="col-asset">Asset</th>
                    <th className="col-types">{t('dashboard.type')}</th>
                    <th className="col-level">Level</th>
                    <th className="col-location">{t('dashboard.location')}</th>
                    <th className="col-remark">{t('dashboard.remark')}</th>
                  </tr>
                </thead>
                <tbody><TableSkeleton columns={11} /></tbody>
              </table>
            ) : rows.length === 0 ? (
              <EmptyState
                title={hasFilter ? t('dashboard.noEquipmentMatches') : archivedOnly ? t('archived.noneYet') : t('dashboard.noEquipmentYet')}
                subtitle={hasFilter ? t('dashboard.tryClearingFilter') : archivedOnly ? undefined : t('dashboard.equipmentWillAppear')}
                action={hasFilter ? <Button size="sm" onClick={clearFilters}>{t('dashboard.clearFilters')}</Button> : undefined}
              />
            ) : (
              <table className="grid-table equipment-table" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
                <thead>
                  <tr>
                    <th className="col-relation" style={{ width: 28 }} aria-label={t('dashboard.relationships')} />
                    <th className="col-no text-center" style={{ width: 44 }}>{t('dashboard.no')}</th>
                    <th className="col-status">{sortHeader('status', t('dashboard.status'))}</th>
                    <th className="col-jabil">{sortHeader('jabil_id', 'Jabil ID')}</th>
                    <th className="col-part">{sortHeader('part_number', 'Part number')}</th>
                    <th className="col-serial">{sortHeader('serial_number', 'Serial number')}</th>
                    <th className="col-asset">{sortHeader('asset', 'Asset')}</th>
                    <th className="col-types">{sortHeader('types', t('dashboard.type'))}</th>
                    <th className="col-level">{sortHeader('level', 'Level')}</th>
                    <th className="col-location">{sortHeader('current_location_id', t('dashboard.location'))}</th>
                    <th className="col-remark">{sortHeader('remark', t('dashboard.remark'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.id}
                      data-archived={!!r.archived_at}
                      onClick={() => setOpenTarget({ id: r.id, mode: 'view' })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenTarget({ id: r.id, mode: 'view' });
                        }
                      }}
                      tabIndex={0}
                      aria-label={t('dashboard.openDetailsFor') + ' ' + r.serial_number}
                      className="cursor-pointer"
                      style={openTarget?.id === r.id ? { background: 'var(--machine-tint)' } : undefined}
                    >
                      {/* Dấu hiệu quan hệ: ┬ có con, └ có cha, ├ cả hai. Mã hoá
                        thông tin bằng hình dạng chứ không bằng màu. */}
                      <td className="col-relation text-center" style={{ color: 'var(--ink-3)' }}>
                        <span className="ident text-[12px]" title={
                          r.parent_id && r.has_children ? t('dashboard.hasParentAndChildren')
                            : r.has_children ? t('dashboard.hasChildren')
                              : r.parent_id ? t('dashboard.hasParent') : t('dashboard.standalone')
                        }>
                          {r.parent_id && r.has_children ? '├' : r.has_children ? '┬' : r.parent_id ? '└' : ''}
                        </span>
                      </td>
                      <td className="col-no ident text-center" style={{ color: 'var(--ink-3)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="col-status">
                        {r.archived_at
                          ? <Tag text={t('equipmentDetail.archived')} tone="warn" />
                          : r.status
                            ? <span className="equipment-status" data-status={r.status.code} title={r.status.display_name}>
                              <span className="equipment-status-dot" aria-hidden="true" />
                              <span className="equipment-status-label">{r.status.display_name}</span>
                            </span>
                            : <span style={{ color: 'var(--ink-3)' }}>—</span>}
                      </td>
                      <td className="col-jabil ident" style={{ color: 'var(--ink-2)' }}>{r.jabil_id ?? '—'}</td>
                      <td className="col-part ident" style={{ color: 'var(--ink-2)' }}>{r.part_number ?? '—'}</td>
                      <td className="col-serial ident font-medium">{r.serial_number}</td>
                      <td className="col-asset ident" style={{ color: 'var(--ink-2)' }}>{r.asset ?? '—'}</td>
                      <td className="col-types" style={{ color: 'var(--ink-2)' }}>{r.type?.display_name ?? '—'}</td>
                      <td className="col-level" style={{ color: 'var(--ink-2)' }}>{r.level?.display_name ?? '—'}</td>
                      <td className="col-location">{r.current_location?.code ?? '—'}</td>
                      <td className="col-remark">
                        <div className="truncate" style={{ maxWidth: 200, color: 'var(--ink-2)' }} title={r.remark ?? undefined}>
                          {r.remark ?? '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="dashboard-footer">
            <span>{t('dashboard.showing')} {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} {t('dashboard.of')} {total} {t('dashboard.records')}</span>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('dashboard.previous')}</Button>
              <span>{t('dashboard.page')} {page} / {lastPage}</span>
              <Button size="sm" disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>{t('dashboard.next')}</Button>
            </div>
          </div></div>
      </section>

      {openTarget && me && (
        <div
          className="equipment-detail-overlay"
          style={{ background: 'rgba(18,25,26,0.45)' }}
          onClick={() => setOpenTarget(null)}
          role="presentation"
        >
          <div
            ref={detailRef}
            tabIndex={-1}
            className="equipment-detail-dialog"
            style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.equipmentDetails') + ': ' + (rows.find(row => row.id === openTarget.id)?.serial_number ?? '')}
          >
            <EquipmentDetailModal
              key={`${openTarget.id}:${openTarget.mode}`}
              id={openTarget.id}
              me={me}
              fields={fields}
              locations={locations}
              equipmentTypes={equipmentTypes}
              equipmentLevels={equipmentLevels}
              equipmentStatuses={equipmentStatuses}
              initialMode={openTarget.mode}
              onClose={() => setOpenTarget(null)}
              onChanged={() => void fetchRows()}
              onOpenOther={(id) => setOpenTarget({ id, mode: 'view' })}
            />
          </div>
        </div>
      )}

      {!archivedOnly && (
        <ImportEquipmentModal
          open={showImport}
          onClose={() => setShowImport(false)}
          onImported={() => void fetchRows()}
        />
      )}

      {!archivedOnly && me && (
        <CreateEquipmentModal
          open={showCreate}
          me={me}
          fields={fields}
          locations={locations}
          equipmentTypes={equipmentTypes}
          equipmentLevels={equipmentLevels}
          equipmentStatuses={equipmentStatuses}
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            if (result.duplicateWarning) {
              toast.warning(t('dashboard.createdWithWarningNotice', { serial: result.serialNumber }));
            } else {
              toast.success(t('dashboard.createdNotice', { serial: result.serialNumber }));
            }
            void fetchRows();
          }}
        />
      )}
    </div>
  );
}
