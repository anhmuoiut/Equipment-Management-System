'use client';

/**
 * Presentational search/filter/action bar for the Equipment Masterlist
 * (ui-requirements.md 3.3) — all query/filter/pagination/permission state
 * and fetch logic stays in `EquipmentMasterlist`; this component only
 * renders controls and calls the handlers it's given.
 *
 * The six advanced filters (Type/Status/Level/Location/Calibration/Under
 * repair) never render as a permanent row. They live behind one "Filters"
 * dropdown next to search, at every viewport width — a floating popover
 * portaled to `document.body` and positioned from the trigger's own
 * bounding box, the same mechanism `SearchableSelect` uses, so it always
 * escapes the toolbar's own layout and stays clear of the viewport edge.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ListFilter, Plus, Search, Upload, X } from 'lucide-react';
import type { LocationRef, MasterDataRef, StatusRef } from '@/lib/client/api';
import { Button } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

export const CALIBRATION_STATES = ['NOT_REQUIRED', 'NOT_CALIBRATED', 'OVERDUE', 'DUE_SOON', 'VALID'] as const;

export type EquipmentFilterValues = {
  typeFilter: string;
  statusFilter: string;
  levelFilter: string;
  locationFilter: string;
  calibrationFilter: string;
  underRepairFilter: boolean;
};

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;

  filters: EquipmentFilterValues;
  onTypeFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onLevelFilterChange: (v: string) => void;
  onLocationFilterChange: (v: string) => void;
  onCalibrationFilterChange: (v: string) => void;
  onUnderRepairFilterChange: (v: boolean) => void;

  equipmentTypes: MasterDataRef[];
  equipmentStatuses: StatusRef[];
  equipmentLevels: MasterDataRef[];
  locations: LocationRef[];

  hasFilter: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;

  loading: boolean;
  total: number;

  canCreate: boolean;
  archivedOnly: boolean;
  onImport: () => void;
  onCreate: () => void;
};

export function EquipmentToolbar({
  search, onSearchChange, searchRef,
  filters, onTypeFilterChange, onStatusFilterChange, onLevelFilterChange,
  onLocationFilterChange, onCalibrationFilterChange, onUnderRepairFilterChange,
  equipmentTypes, equipmentStatuses, equipmentLevels, locations,
  hasFilter, activeFilterCount, onClearFilters, loading, total,
  canCreate, archivedOnly, onImport, onCreate,
}: Props) {
  const { t } = useTranslation();

  const typeLabel = filters.typeFilter ? equipmentTypes.find((o) => o.id === filters.typeFilter)?.display_name : null;
  const statusLabel = filters.statusFilter ? equipmentStatuses.find((o) => o.id === filters.statusFilter)?.display_name : null;
  const levelLabel = filters.levelFilter ? equipmentLevels.find((o) => o.id === filters.levelFilter)?.display_name : null;
  const locationLabel = filters.locationFilter ? locations.find((o) => o.id === filters.locationFilter)?.code : null;
  const calibrationLabel = filters.calibrationFilter ? t(`calibration.state.${filters.calibrationFilter}`) : null;

  // Each active structured filter is its own removable chip — visually and
  // conceptually distinct from the search scope above (which narrows what
  // a typed term matches, not a standing condition combined with it).
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    typeLabel && { key: 'type', label: `${t('dashboard.type')}: ${typeLabel}`, onRemove: () => onTypeFilterChange('') },
    statusLabel && { key: 'status', label: `${t('dashboard.status')}: ${statusLabel}`, onRemove: () => onStatusFilterChange('') },
    levelLabel && { key: 'level', label: `${t('dashboard.level')}: ${levelLabel}`, onRemove: () => onLevelFilterChange('') },
    locationLabel && { key: 'location', label: `${t('dashboard.location')}: ${locationLabel}`, onRemove: () => onLocationFilterChange('') },
    calibrationLabel && { key: 'calibration', label: `${t('calibration.title')}: ${calibrationLabel}`, onRemove: () => onCalibrationFilterChange('') },
    filters.underRepairFilter && { key: 'underRepair', label: t('dashboard.underRepairOnly'), onRemove: () => onUnderRepairFilterChange(false) },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  return (
    <div className="equipment-toolbar-wrap">
    <div className="equipment-toolbar">
      <div className="equipment-search">
        <FiltersDropdown
          filters={filters}
          onTypeFilterChange={onTypeFilterChange} onStatusFilterChange={onStatusFilterChange}
          onLevelFilterChange={onLevelFilterChange} onLocationFilterChange={onLocationFilterChange}
          onCalibrationFilterChange={onCalibrationFilterChange} onUnderRepairFilterChange={onUnderRepairFilterChange}
          equipmentTypes={equipmentTypes} equipmentStatuses={equipmentStatuses}
          equipmentLevels={equipmentLevels} locations={locations}
          activeFilterCount={activeFilterCount}
        />
        {/* One smart search box — no field picker. It matches every text
            field plus Type/Status/Level/Location by name server-side
            (lib/services/equipment.ts), so typing e.g. "Base" finds
            Base-type equipment without saying where to look first. */}
        <div className="equipment-search-combined">
          <Search size={15} aria-hidden="true" className="equipment-search-icon" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={t('dashboard.searchLabel')} placeholder={t('dashboard.searchPlaceholder')}
            className="equipment-search-input"
          />
        </div>
      </div>
      <div className="equipment-toolbar-actions">
        <span className="equipment-record-count" role="status">
          {loading ? t('common.loadingEllipsis') : total + ' ' + t('dashboard.records')}
        </span>
        {hasFilter && (
          <Button size="sm" onClick={onClearFilters}>
            {t('dashboard.clearFilters')}
          </Button>
        )}
        {!archivedOnly && canCreate && (
          <>
            <Button size="sm" onClick={onImport} title={t('dashboard.importFromFile')}>
              <Upload size={14} aria-hidden="true" />{t('dashboard.import')}
            </Button>
            <Button size="sm" variant="primary" onClick={onCreate}>
              <Plus size={14} aria-hidden="true" />{t('dashboard.newEquipment')}
            </Button>
          </>
        )}
      </div>
    </div>
    {chips.length > 0 && (
      <div className="equipment-filter-chips" role="group" aria-label={t('dashboard.filtersPanelLabel')}>
        {chips.map((chip) => (
          <span key={chip.key} className="equipment-filter-chip">
            {chip.label}
            <button type="button" onClick={chip.onRemove} aria-label={`${t('dashboard.removeFilter')}: ${chip.label}`}>
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
    )}
    </div>
  );
}

type FiltersDropdownProps = {
  filters: EquipmentFilterValues;
  onTypeFilterChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onLevelFilterChange: (v: string) => void;
  onLocationFilterChange: (v: string) => void;
  onCalibrationFilterChange: (v: string) => void;
  onUnderRepairFilterChange: (v: boolean) => void;
  equipmentTypes: MasterDataRef[];
  equipmentStatuses: StatusRef[];
  equipmentLevels: MasterDataRef[];
  locations: LocationRef[];
  activeFilterCount: number;
};

function FiltersDropdown({
  filters, onTypeFilterChange, onStatusFilterChange, onLevelFilterChange,
  onLocationFilterChange, onCalibrationFilterChange, onUnderRepairFilterChange,
  equipmentTypes, equipmentStatuses, equipmentLevels, locations, activeFilterCount,
}: FiltersDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 16;
    const width = Math.min(560, window.innerWidth - margin * 2);
    const below = window.innerHeight - r.bottom - margin - 4;
    const above = r.top - margin - 4;
    const openAbove = below < 260 && above > below;
    setRect({
      ...(openAbove ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      left: Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)),
      width,
    });
  }

  function toggle() {
    if (open) { setOpen(false); return; }
    updatePosition();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onReposition() { updatePosition(); }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  const triggerLabel = activeFilterCount > 0
    ? t('dashboard.filtersCount', { count: activeFilterCount })
    : t('dashboard.filters');

  return (
    <>
      <button
        type="button" ref={triggerRef}
        aria-haspopup="true" aria-expanded={open} aria-controls="equipment-filters-panel"
        onClick={toggle}
        className="equipment-filters-trigger"
        data-active={activeFilterCount > 0}
      >
        <ListFilter size={15} aria-hidden="true" />
        {triggerLabel}
        <ChevronDown size={14} aria-hidden="true" className="equipment-filters-trigger-chevron" />
      </button>

      {open && rect && createPortal(
        <div
          ref={popoverRef}
          id="equipment-filters-panel"
          role="region"
          aria-label={t('dashboard.filtersPanelLabel')}
          className="equipment-filters-panel"
          style={{ ...rect, position: 'fixed' }}
        >
          <div className="equipment-filters-panel-head">
            <span>{t('dashboard.filtersPanelLabel')}</span>
            <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label={t('dashboard.closeFilters')}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="equipment-filters-grid">
            <label>
              {t('dashboard.type')}
              <SearchableSelect
                value={filters.typeFilter} onChange={onTypeFilterChange} clearable ariaLabel={t('dashboard.type')}
                placeholder={t('dashboard.allTypes')}
                options={equipmentTypes.map((o) => ({ value: o.id, label: o.display_name }))}
                className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
            <label>
              {t('dashboard.status')}
              <SearchableSelect
                value={filters.statusFilter} onChange={onStatusFilterChange} clearable ariaLabel={t('dashboard.status')}
                placeholder={t('dashboard.allStatuses')}
                options={equipmentStatuses.map((o) => ({ value: o.id, label: o.display_name }))}
                className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
            <label>
              {t('dashboard.level')}
              <SearchableSelect
                value={filters.levelFilter} onChange={onLevelFilterChange} clearable ariaLabel={t('dashboard.level')}
                placeholder={t('dashboard.allLevels')}
                options={equipmentLevels.map((o) => ({ value: o.id, label: o.display_name }))}
                className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
            <label>
              {t('dashboard.location')}
              <SearchableSelect
                value={filters.locationFilter} onChange={onLocationFilterChange} clearable ariaLabel={t('dashboard.location')}
                placeholder={t('dashboard.allLocations')}
                options={locations.map((o) => ({ value: o.id, label: o.code }))}
                className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
            <label>
              {t('calibration.title')}
              <SearchableSelect
                value={filters.calibrationFilter} onChange={onCalibrationFilterChange} clearable ariaLabel={t('calibration.title')}
                placeholder={t('dashboard.allCalibrationStates')}
                options={CALIBRATION_STATES.map((s) => ({ value: s, label: t(`calibration.state.${s}`) }))}
                className="border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
            <label className="equipment-filters-checkbox">
              <input
                type="checkbox" checked={filters.underRepairFilter}
                onChange={(e) => onUnderRepairFilterChange(e.target.checked)}
              />
              {t('dashboard.underRepairOnly')}
            </label>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
