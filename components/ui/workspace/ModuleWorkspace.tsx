'use client';

/**
 * Trang của một module: Masterlist + Detail Panel (docs/DETAIL_MODEL.md).
 * Lo chọn dòng, ‹ › theo thứ tự đang hiện, phím ↑ ↓ / J K, đường dẫn
 * `?id=` (mở lại / chia sẻ được), `?new=1` (thêm mới), `?tool=` (công cụ
 * như Import), và hỏi trước khi rời bản ghi đang sửa. Module chỉ truyền cột
 * và cách vẽ chi tiết.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useFetch } from '@/lib/client/useFetch';
import { PageHeading } from '@/components/layout/PageHeading';
import { Masterlist, type Column, type QuickFilter } from '@/components/ui/masterlist/Masterlist';

export type ListState<R> = {
  rows: R[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  upsert: (row: R) => void;
  remove: (id: string) => void;
};

/** Mảng rỗng cố định: `rows` phải giữ nguyên identity khi chưa có dữ liệu (Masterlist memo theo nó). */
const NO_ROWS: never[] = [];

/** Tải danh sách của module một lần; sửa / thêm / xóa cập nhật tại chỗ, tải lại giữ dòng cũ. */
export function useList<R extends { id: string }>(url: string): ListState<R> {
  const { data, setData, loading, error, reload } = useFetch<R[]>(url);
  return {
    rows: data ?? NO_ROWS, loading, error, reload,
    upsert: (row) => setData((list) => {
      const rows = list ?? [];
      return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows];
    }),
    remove: (id) => setData((list) => (list ?? []).filter((r) => r.id !== id)),
  };
}

export type DetailCtx<R> = {
  row: R | null;
  creating: boolean;
  loading: boolean;
  error: string | null;
  /** Thử tải lại bản ghi khi `error` (trang chi tiết riêng). */
  onRetry?: () => void;
  nav: { onPrev?: () => void; onNext?: () => void };
  onClose: () => void;
  onExpand?: () => void;
  onSaved: (row: R, created: boolean) => void;
  onDeleted: (row: R) => void;
  /** Mở bản ghi khác trong cùng module (cha / con…). */
  open: (id: string) => void;
  /** Mở form thêm mới với giá trị điền sẵn (ví dụ thêm thiết bị con: { parent_id }). */
  create?: (defaults?: Record<string, unknown>) => void;
  /** Giá trị điền sẵn của form thêm mới đang mở. */
  defaults?: Record<string, unknown>;
  /** Tải lại cả masterlist — khi thao tác đổi cả các dòng khác (ví dụ Swap, xóa cả cây). */
  reload?: () => void;
  leaveRef: MutableRefObject<((proceed: () => void) => void) | null>;
};

/**
 * Công cụ của module (ví dụ Import Excel): nút trên thanh công cụ, mở trong
 * khung bên phải — cùng chỗ với Detail Panel, không mở hộp thoại riêng.
 */
export type WorkspaceTool = {
  key: string;
  label: string;
  icon?: ReactNode;
  render: (ctx: { onClose: () => void }) => ReactNode;
};

export function ModuleWorkspace<R extends { id: string }>({
  title, list, columns, storageKey, defaultColumns, exportName, quickFilters, leading, rowTone, canAdd, addLabel,
  tools, renderDetail, detailPath, beforeList, mobileCard,
}: {
  title: string;
  list: ListState<R>;
  columns: Column<R>[];
  /** Thẻ dòng trên điện thoại (RowCard); mặc định dựng từ các cột. */
  mobileCard?: (row: R) => ReactNode;
  storageKey: string;
  /** Cột hiện sẵn, theo thứ tự này; cột khác ẩn (mở ở Tùy chọn hiển thị). */
  defaultColumns?: string[];
  exportName: string;
  quickFilters?: QuickFilter<R>[];
  leading?: { header: ReactNode; label: string; render: (row: R) => ReactNode };
  rowTone?: (row: R) => 'alert' | 'warn' | undefined;
  canAdd: boolean;
  addLabel?: string;
  /** Nút công cụ đứng sau Xuất Excel, trước + Thêm (điện thoại: mục trong menu ⋮). */
  tools?: WorkspaceTool[];
  renderDetail: (ctx: DetailCtx<R>) => ReactNode;
  /** Trang chi tiết toàn trang (nút ⤢). */
  detailPath?: (id: string) => string;
  /** Nội dung trên masterlist (ví dụ danh sách con của Configuration). */
  beforeList?: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [creating, setCreating] = useState(searchParams.get('new') === '1' && canAdd);
  // ?new=1&defaults={...}: form thêm mới điền sẵn (trang chi tiết riêng mở "Thêm thiết bị con").
  const [createDefaults, setCreateDefaults] = useState<Record<string, unknown> | undefined>(() => {
    try { return JSON.parse(searchParams.get('defaults') ?? 'null') ?? undefined; } catch { return undefined; }
  });
  const [toolKey, setToolKey] = useState<string | null>(searchParams.get('tool'));
  const tool = tools?.find((x) => x.key === toolKey) ?? null;
  const activeTool = tool?.key ?? null;
  const [viewIds, setViewIds] = useState<string[]>([]);
  const leaveRef = useRef<((proceed: () => void) => void) | null>(null);
  const lastSelected = useRef<string | null>(null);

  const open = selectedId !== null || creating || tool !== null;

  // Đồng bộ đường dẫn: ?id=… hoặc ?new=1 (giữ các tham số khác).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('id');
    params.delete('new');
    params.delete('tool');
    params.delete('defaults');
    if (selectedId) params.set('id', selectedId);
    if (creating) params.set('new', '1');
    if (activeTool) params.set('tool', activeTool);
    const next = params.toString();
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, creating, activeTool]);

  const guarded = useCallback((go: () => void) => {
    if (leaveRef.current) leaveRef.current(go);
    else go();
  }, []);

  const select = useCallback((id: string) => {
    guarded(() => { setCreating(false); setToolKey(null); setSelectedId(id); lastSelected.current = id; });
  }, [guarded]);

  const create = useCallback((defaults?: Record<string, unknown>) => {
    guarded(() => { setSelectedId(null); setToolKey(null); setCreateDefaults(defaults); setCreating(true); });
  }, [guarded]);

  const close = useCallback(() => {
    const back = lastSelected.current;
    setSelectedId(null);
    setCreating(false);
    setToolKey(null);
    if (back) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-id="${back}"]`)?.focus());
  }, []);

  const index = selectedId ? viewIds.indexOf(selectedId) : -1;
  const prevId = index > 0 ? viewIds[index - 1] : undefined;
  const nextId = index >= 0 && index < viewIds.length - 1 ? viewIds[index + 1] : undefined;
  const nav = useMemo(() => ({
    onPrev: prevId ? () => { setSelectedId(prevId); lastSelected.current = prevId; } : undefined,
    onNext: nextId ? () => { setSelectedId(nextId); lastSelected.current = nextId; } : undefined,
  }), [prevId, nextId]);

  // ↑ / ↓ (hoặc K / J) chuyển bản ghi khi không gõ trong ô nhập.
  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], .tree')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.key === 'ArrowUp' || e.key === 'k') && nav.onPrev) { e.preventDefault(); guarded(nav.onPrev); }
      if ((e.key === 'ArrowDown' || e.key === 'j') && nav.onNext) { e.preventDefault(); guarded(nav.onNext); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, nav, guarded]);

  const row = selectedId ? list.rows.find((r) => r.id === selectedId) ?? null : null;
  const notFound = !!selectedId && !list.loading && !row && !list.error;

  return (
    <div className="ws" data-open={open || undefined} data-add={canAdd || undefined}>
      <PageHeading title={title} subtitle={list.loading ? undefined : t('ml.count', { count: viewIds.length, total: list.rows.length })} />
      {beforeList}
      {/* Điện thoại: một nút + nổi cho mọi module (CSS ẩn nó trên desktop, nơi có nút + Thêm trên thanh công cụ). */}
      {canAdd && !open && (
        <button type="button" className="ws-add-fab" aria-label={addLabel ?? t('ml.add')}
          title={addLabel ?? t('ml.add')} onClick={() => create()}>
          <Plus size={26} aria-hidden="true" />
        </button>
      )}
      <div className="ws-main">
        <div className="ws-list">
          <Masterlist
            title={title} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
            columns={columns} mobileCard={mobileCard} storageKey={storageKey} defaultColumns={defaultColumns} exportName={exportName} quickFilters={quickFilters}
            leading={leading} rowTone={rowTone} selectedId={selectedId} onSelect={select}
            onAdd={canAdd ? () => create() : undefined}
            addLabel={addLabel} onViewChange={setViewIds}
            tools={tools?.map((x) => ({
              key: x.key, label: x.label, icon: x.icon, active: toolKey === x.key,
              onClick: () => guarded(() => { setSelectedId(null); setCreating(false); setToolKey(x.key); }),
            }))}
          />
        </div>
        {open && <div className="ws-scrim" aria-hidden="true" />}
        {open && (
          <div className="ws-panel">
            {tool ? tool.render({ onClose: close }) : renderDetail({
              row: creating ? null : row,
              creating,
              loading: list.loading && !row,
              // Danh sách tải lỗi → panel báo cùng lỗi (không kẹt ở khung đang tải).
              error: !row && list.error ? list.error : notFound ? t('dp.notFound') : null,
              onRetry: list.reload,
              nav,
              onClose: close,
              onExpand: detailPath && selectedId ? () => router.push(detailPath(selectedId)) : undefined,
              onSaved: (saved, created) => {
                list.upsert(saved);
                if (created) { setCreating(false); setSelectedId(saved.id); lastSelected.current = saved.id; }
              },
              onDeleted: (deleted) => { list.remove(deleted.id); close(); },
              open: select,
              create: canAdd ? create : undefined,
              reload: list.reload,
              defaults: creating ? createDefaults : undefined,
              leaveRef,
            })}
          </div>
        )}
      </div>
    </div>
  );
}
