'use client';

/**
 * Masterlist — trang danh sách dùng chung cho mọi module (docs/DETAIL_MODEL.md
 * mục 2). Mỗi module chỉ khai báo cột; khung lo tìm kiếm, bộ lọc, sắp xếp,
 * tùy chọn hiển thị cột, xuất Excel, chọn dòng.
 *
 * Dữ liệu đã tải đủ ở client nên lọc / sắp xếp tức thì, và thứ tự đang hiện
 * được báo lên (onViewChange) để Detail Panel chuyển ‹ › đúng thứ tự đó.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, Plus, Search, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, TableSkeleton } from '@/components/ui';
import { ColumnSettings, useColumnPrefs } from './ColumnSettings';
import { exportToExcel } from './exportExcel';

export type Column<R> = {
  key: string;
  label: string;
  /** Giá trị để tìm, lọc, sắp xếp, xuất Excel. */
  value: (row: R) => string | number | null;
  /** Hiển thị trong ô (mặc định: value). */
  render?: (row: R) => ReactNode;
  /** Có bộ lọc chọn từ các giá trị đang có. */
  filter?: boolean;
  /** Bề rộng tối thiểu (px). */
  width?: number;
  /** Cho phép xuống dòng (mặc định không). */
  wrap?: boolean;
};

export type QuickFilter<R> = { key: string; label: string; test: (row: R) => boolean };

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const PAGE = 200;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null || a === '') return 1;
  if (b === null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export function Masterlist<R extends { id: string }>({
  title, rows, loading, error, onRetry, columns, storageKey, selectedId, onSelect,
  onAdd, addLabel, toolbarExtra, exportName, quickFilters, leading, onViewChange, rowTone,
}: {
  title: string;
  rows: R[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  columns: Column<R>[];
  /** Khóa lưu tùy chọn cột trên trình duyệt. */
  storageKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  toolbarExtra?: ReactNode;
  exportName: string;
  quickFilters?: QuickFilter<R>[];
  /** Cột đầu trước `No` (Equipment: quan hệ cha–con). */
  leading?: { header: ReactNode; label: string; render: (row: R) => ReactNode };
  onViewChange?: (ids: string[]) => void;
  /** Tô nền dòng (ví dụ quá hạn). */
  rowTone?: (row: R) => 'alert' | 'warn' | undefined;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);
  const prefs = useColumnPrefs(storageKey, columns.map((c) => c.key));
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const visibleColumns = useMemo(
    () => prefs.order.map((k) => columns.find((c) => c.key === k)).filter((c): c is Column<R> => !!c && !prefs.hidden.includes(c.key)),
    [columns, prefs.order, prefs.hidden],
  );

  const filterable = columns.filter((c) => c.filter);
  const filterValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    filterable.forEach((c) => {
      const set = new Set<string>();
      rows.forEach((r) => { const v = c.value(r); set.add(v === null || v === '' ? '' : String(v)); });
      out[c.key] = [...set].sort((a, b) => compare(a || null, b || null));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const quickTest = quickFilters?.find((f) => f.key === quick)?.test;
    let out = rows.filter((r) => {
      if (quickTest && !quickTest(r)) return false;
      for (const [key, wanted] of Object.entries(filters)) {
        const col = columns.find((c) => c.key === key);
        if (!col) continue;
        const v = col.value(r);
        if ((v === null || v === '' ? '' : String(v)) !== wanted) return false;
      }
      if (!q) return true;
      return columns.some((c) => {
        const v = c.value(r);
        return v !== null && String(v).toLowerCase().includes(q);
      });
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const res = compare(col.value(a), col.value(b));
          return sort.dir === 'asc' ? res : -res;
        });
      }
    }
    return out;
  }, [rows, search, filters, sort, quick, quickFilters, columns]);

  const ids = useMemo(() => view.map((r) => r.id), [view]);
  useEffect(() => { onViewChange?.(ids); }, [ids, onViewChange]);
  useEffect(() => { setLimit(PAGE); }, [search, filters, sort, quick]);

  // Dòng đang mở nằm ngoài phần đã vẽ (ví dụ chuyển bằng ‹ ›) → vẽ thêm tới nó.
  useEffect(() => {
    if (!selectedId) return;
    const index = ids.indexOf(selectedId);
    if (index >= limit) setLimit(index + PAGE);
    requestAnimationFrame(() => {
      document.querySelector(`[data-row-id="${selectedId}"]`)?.scrollIntoView?.({ block: 'nearest' });
    });
  }, [selectedId, ids, limit]);

  // Vẽ thêm khi cuộn gần cuối.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [view.length, limit]);

  function toggleSort(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  }

  async function doExport() {
    setExporting(true);
    try {
      await exportToExcel(exportName, [
        { label: t('ml.no'), value: (_r: R, i: number) => i + 1 },
        ...visibleColumns.map((c) => ({ label: c.label, value: (r: R) => c.value(r) })),
      ], view);
    } finally {
      setExporting(false);
    }
  }

  const activeFilters = Object.entries(filters);
  const colCount = visibleColumns.length + 1 + (leading ? 1 : 0);

  return (
    <section className="ml" aria-label={title}>
      <div className="ml-toolbar">
        <label className="ml-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ml.searchPlaceholder')} aria-label={t('common.search')}
          />
        </label>
        {filterable.length > 0 && (
          <Button size="sm" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
            <Filter size={14} aria-hidden="true" />{t('ml.filters')}
            {activeFilters.length > 0 && <span className="ml-badge">{activeFilters.length}</span>}
          </Button>
        )}
        {quickFilters?.map((f) => (
          <Button key={f.key} size="sm" aria-pressed={quick === f.key} data-active={quick === f.key}
            onClick={() => setQuick((q) => (q === f.key ? null : f.key))}>
            {f.label}
          </Button>
        ))}
        <div className="ml-toolbar-end">
          <ColumnSettings columns={columns} prefs={prefs} />
          <Button size="sm" onClick={doExport} loading={exporting} disabled={view.length === 0}>
            <Download size={14} aria-hidden="true" />{t('ml.export')}
          </Button>
          {toolbarExtra}
          {onAdd && (
            <Button size="sm" variant="primary" onClick={onAdd}>
              <Plus size={14} aria-hidden="true" />{addLabel ?? t('ml.add')}
            </Button>
          )}
        </div>
      </div>

      {filtersOpen && filterable.length > 0 && (
        <div className="ml-filters">
          {filterable.map((c) => (
            <label key={c.key} className="ml-filter">
              <span>{c.label}</span>
              <select
                value={filters[c.key] ?? '__all'}
                onChange={(e) => setFilters((f) => {
                  const next = { ...f };
                  if (e.target.value === '__all') delete next[c.key]; else next[c.key] = e.target.value;
                  return next;
                })}
              >
                <option value="__all">{t('ml.all')}</option>
                {filterValues[c.key]?.map((v) => <option key={v} value={v}>{v || t('ml.empty')}</option>)}
              </select>
            </label>
          ))}
          {activeFilters.length > 0 && <Button size="sm" onClick={() => setFilters({})}>{t('ml.clearFilters')}</Button>}
        </div>
      )}

      {activeFilters.length > 0 && !filtersOpen && (
        <div className="ml-chips">
          {activeFilters.map(([key, value]) => (
            <button key={key} type="button" className="ml-chip"
              onClick={() => setFilters((f) => { const n = { ...f }; delete n[key]; return n; })}>
              {columns.find((c) => c.key === key)?.label}: {value || t('ml.empty')} <X size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className="ml-scroll">
        <table className="ml-table">
          <thead>
            <tr>
              {leading && <th className="ml-col-leading" aria-label={leading.label}>{leading.header}</th>}
              <th className="ml-col-no">{t('ml.no')}</th>
              {visibleColumns.map((c) => (
                <th key={c.key} style={c.width ? { minWidth: c.width } : undefined}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="ml-sort" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort?.key === c.key
                      ? (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)
                      : <ArrowUpDown size={12} aria-hidden="true" className="ml-sort-idle" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <TableSkeleton columns={colCount} />
            ) : (
              view.slice(0, limit).map((r, i) => (
                <tr key={r.id} data-row-id={r.id} data-selected={r.id === selectedId || undefined} data-tone={rowTone?.(r)}
                  tabIndex={0} onClick={() => onSelect(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }}>
                  {leading && <td className="ml-col-leading">{leading.render(r)}</td>}
                  <td className="ml-col-no">{i + 1}</td>
                  {visibleColumns.map((c) => {
                    const content = c.render ? c.render(r) : c.value(r);
                    return (
                      <td key={c.key} data-wrap={c.wrap || undefined}>
                        {content === null || content === '' || content === undefined ? <span className="ml-empty">—</span> : content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
            {view.length > limit && <tr ref={sentinelRef}><td colSpan={colCount} className="ml-more">{t('common.loadingEllipsis')}</td></tr>}
          </tbody>
        </table>
        {error && <ErrorState message={error} onRetry={onRetry} />}
        {!error && !loading && view.length === 0 && (
          <EmptyState
            title={rows.length === 0 ? t('ml.emptyTitle') : t('ml.noMatch')}
            action={rows.length > 0 ? (
              <Button size="sm" onClick={() => { setSearch(''); setFilters({}); setQuick(null); }}>{t('ml.clearFilters')}</Button>
            ) : undefined}
          />
        )}
      </div>
    </section>
  );
}
