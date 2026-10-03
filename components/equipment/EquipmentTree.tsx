'use client';

/**
 * Tab "Cây thiết bị" — cây thụt lề, mỗi dòng chỉ Part number + Serial
 * (docs/DETAIL_MODEL.md 4.1). Bấm ▸/▾ chỉ mở / đóng nhánh; bấm phần còn lại
 * mở chi tiết thiết bị đó.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Crosshair, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/client/api';
import { translateError } from '@/lib/i18n/errors';
import { Button, ErrorState, Spinner } from '@/components/ui';
import type { EquipmentTreeNode } from '@/lib/types';

type Tree = { root_id: string; nodes: EquipmentTreeNode[] };
const OPEN_ALL_LIMIT = 30;

export function EquipmentTree({ equipmentId, onOpen }: { equipmentId: string; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<Tree>(`/api/equipment/${equipmentId}/tree`).then((r) => setTree(r.data)).catch((e) => { if (e instanceof ApiError) setError(e); });
  }, [equipmentId]);
  useEffect(() => { setTree(null); load(); }, [load]);

  const { byId, children } = useMemo(() => {
    const byId = new Map<string, EquipmentTreeNode>();
    const children = new Map<string, string[]>();
    tree?.nodes.forEach((n) => {
      byId.set(n.id, n);
      if (n.parent_id) children.set(n.parent_id, [...(children.get(n.parent_id) ?? []), n.id]);
    });
    const collator = new Intl.Collator(undefined, { numeric: true });
    children.forEach((list) => list.sort((a, b) => collator.compare(byId.get(a)!.serial_number, byId.get(b)!.serial_number)));
    return { byId, children };
  }, [tree]);

  const pathTo = useCallback((id: string) => {
    const path: string[] = [];
    for (let cur = byId.get(id)?.parent_id; cur; cur = byId.get(cur)?.parent_id) path.push(cur);
    return path;
  }, [byId]);

  // Mặc định: mở chuỗi từ gốc tới thiết bị đang xem + một cấp con; cây nhỏ thì mở hết.
  const showCurrent = useCallback(() => {
    if (!tree) return;
    if (tree.nodes.length <= OPEN_ALL_LIMIT) setExpanded(new Set(tree.nodes.map((n) => n.id)));
    else setExpanded((prev) => new Set([...prev, ...pathTo(equipmentId), equipmentId]));
    setFocused(equipmentId);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-node="${equipmentId}"]`)?.scrollIntoView?.({ block: 'center' }));
  }, [tree, pathTo, equipmentId]);
  useEffect(() => { showCurrent(); }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q || !tree) return new Set<string>();
    return new Set(tree.nodes.filter((n) => n.serial_number.toLowerCase().includes(q) || (n.part_number ?? '').toLowerCase().includes(q)).map((n) => n.id));
  }, [q, tree]);
  // Tìm → tự mở các nhánh chứa dòng khớp.
  useEffect(() => {
    if (matches.size === 0) return;
    setExpanded((prev) => { const next = new Set(prev); matches.forEach((id) => pathTo(id).forEach((p) => next.add(p))); return next; });
  }, [matches, pathTo]);

  // Danh sách dòng đang thấy, theo thứ tự hiển thị.
  const visible = useMemo(() => {
    if (!tree) return [] as { id: string; depth: number; last: boolean[] }[];
    const out: { id: string; depth: number; last: boolean[] }[] = [];
    const walk = (id: string, depth: number, last: boolean[]) => {
      out.push({ id, depth, last });
      if (!expanded.has(id)) return;
      const kids = children.get(id) ?? [];
      kids.forEach((k, i) => walk(k, depth + 1, [...last, i === kids.length - 1]));
    };
    walk(tree.root_id, 0, []);
    return out;
  }, [tree, expanded, children]);

  function toggle(id: string, open?: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(id);
      if (shouldOpen) next.add(id); else next.delete(id);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = visible.findIndex((v) => v.id === focused);
    const current = visible[i];
    if (!current) return;
    const move = (j: number) => {
      const target = visible[Math.max(0, Math.min(visible.length - 1, j))];
      if (!target) return;
      setFocused(target.id);
      listRef.current?.querySelector<HTMLElement>(`[data-node="${target.id}"] .tree-row`)?.focus();
    };
    if (e.key === 'ArrowDown') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); toggle(current.id, true); }
    else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (expanded.has(current.id) && children.has(current.id)) toggle(current.id, false);
      else { const parent = byId.get(current.id)?.parent_id; if (parent) move(visible.findIndex((v) => v.id === parent)); }
    } else if (e.key === 'Enter') { e.preventDefault(); onOpen(current.id); }
  }

  if (error) return <ErrorState message={translateError(error.code, language, error.message)} onRetry={load} />;
  if (!tree) return <Spinner label={t('common.loadingEllipsis')} />;

  return (
    <div className="tree">
      <div className="tree-toolbar">
        <label className="ml-search tree-search">
          <Search size={14} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('eq.treeSearch')} aria-label={t('eq.treeSearch')} />
        </label>
        <Button size="sm" onClick={() => setExpanded(new Set(tree.nodes.map((n) => n.id)))}>{t('eq.expandAll')}</Button>
        <Button size="sm" onClick={() => setExpanded(new Set())}>{t('eq.collapseAll')}</Button>
        <Button size="sm" onClick={showCurrent}><Crosshair size={13} aria-hidden="true" />{t('eq.showCurrent')}</Button>
      </div>
      <p className="tree-count">{t('eq.treeCount', { count: tree.nodes.length })}</p>
      <ul className="tree-list" role="tree" ref={listRef} onKeyDown={onKeyDown}>
        {visible.map(({ id, depth, last }) => {
          const node = byId.get(id)!;
          const hasKids = children.has(id);
          const isOpen = expanded.has(id);
          return (
            <li key={id} data-node={id} role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-level={depth + 1}
              aria-selected={id === equipmentId} data-current={id === equipmentId || undefined} data-match={matches.has(id) || undefined}>
              <div className="tree-row" tabIndex={focused === id ? 0 : -1} onFocus={() => setFocused(id)}
                onClick={() => onOpen(id)} title={`${node.part_number ?? '—'} · ${node.serial_number}`}>
                {last.map((isLast, level) => (
                  <span key={level} className="tree-guide" data-kind={level === last.length - 1 ? (isLast ? 'last' : 'mid') : (isLast ? 'none' : 'line')} aria-hidden="true" />
                ))}
                {hasKids ? (
                  <button type="button" className="tree-toggle" tabIndex={-1} aria-label={isOpen ? t('eq.collapse') : t('eq.expand')}
                    onClick={(e) => { e.stopPropagation(); toggle(id); }}>
                    {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  </button>
                ) : <span className="tree-toggle-space" aria-hidden="true" />}
                <span className="tree-pn">{node.part_number ?? '—'}</span>
                <span className="tree-sn">{node.serial_number}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
