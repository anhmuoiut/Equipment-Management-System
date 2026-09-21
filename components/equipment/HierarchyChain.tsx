'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, ChevronRight, Layers3, LocateFixed, MapPin, Network } from 'lucide-react';
import type { ContextNode, LocationRef, MasterDataRef } from '@/lib/client/api';
import { buildEquipmentHierarchy, type EquipmentBranch, type HierarchyEquipment } from '@/lib/client/equipment-hierarchy';

type Props = {
  current: HierarchyEquipment;
  ancestors: ContextNode[];
  descendants: ContextNode[];
  locations: LocationRef[];
  types: MasterDataRef[];
  statuses: MasterDataRef[];
  onOpen: (id: string) => void;
};

/** "Tester FT-04 › Base B-02 › Fixture FX-2251-M14" — matches the type-icon
 *  language used everywhere else in the tree, using Part Number as the
 *  primary identifier where available (falls back to Serial Number). */
function crumbLabel(
  node: { type_id: string | null; part_number: string | null; serial_number: string },
  typeName: (id: string | null) => string,
): string {
  return `${typeName(node.type_id)} ${node.part_number ?? node.serial_number}`;
}

export function HierarchyChain({ current, ancestors, descendants, locations, types, statuses, onOpen }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLOListElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const tree = buildEquipmentHierarchy(current, ancestors, descendants);
  const typeById = new Map(types.map((x) => [x.id, x.display_name]));
  const statusById = new Map(statuses.map((x) => [x.id, x]));
  const typeName = (id: string | null) => (id && typeById.get(id)) || t('hierarchy.equipmentLabel');
  const typeIconFor = (id: string | null) => {
    const code = types.find((x) => x.id === id)?.code;
    return code === 'tester' ? Network : code === 'base' ? Layers3 : Box;
  };
  const locCode = (id: string) => locations.find((location) => location.id === id)?.code ?? '—';
  const directChildren = descendants.filter((node) => node.parent_id === current.id).length;
  // Root-first order — get_equipment_ancestors returns depth 1 = immediate
  // parent, increasing toward the root, so the breadcrumb reads left (root)
  // to right (the equipment you're currently viewing).
  const breadcrumbChain = [...ancestors].sort((a, b) => b.depth - a.depth);
  const centerSelected = useCallback((forceCenter = true) => {
    const canvas = canvasRef.current;
    const selected = selectedRef.current;
    if (!canvas || !selected) return;
    // Compact trees use the dialog's single vertical scroll area.
    const scroller = getComputedStyle(canvas).overflowY === 'visible'
      ? canvas.closest<HTMLElement>('.equipment-detail-body') ?? canvas
      : canvas;
    const container = scroller.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    const outsideX = card.left < container.left || card.right > container.left + scroller.clientWidth;
    const outsideY = card.top < container.top || card.bottom > container.top + scroller.clientHeight;
    scroller.scrollTo({
      left: forceCenter || outsideX
        ? Math.max(0, scroller.scrollLeft + card.left - container.left - Math.max(12, (scroller.clientWidth - card.width) / 2))
        : scroller.scrollLeft,
      top: forceCenter || outsideY
        ? Math.max(0, scroller.scrollTop + card.top - container.top - Math.max(12, (scroller.clientHeight - card.height) / 2))
        : scroller.scrollTop,
      behavior: 'auto',
    });
  }, []);
  useEffect(() => {
    let frame = 0;
    const recenter = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => centerSelected(false));
    };
    const observer = new ResizeObserver(recenter);
    if (canvasRef.current) observer.observe(canvasRef.current);
    if (treeRef.current) observer.observe(treeRef.current);
    const body = canvasRef.current?.closest('.equipment-detail-body');
    if (body) observer.observe(body);
    recenter();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [current.id, centerSelected]);

  function renderBranch(branch: EquipmentBranch) {
    const node = branch.equipment;
    const selected = branch.relation === 'current';
    const archived = !!node.archived_at;
    const name = typeName(node.type_id);
    const Icon = typeIconFor(node.type_id);
    const status = node.status_id ? statusById.get(node.status_id) : undefined;
    const relation = {
      root: t('hierarchy.root'),
      parent: t('hierarchy.parent'),
      current: t('hierarchy.current'),
      child: t('hierarchy.child'),
      descendant: t('hierarchy.descendant'),
    }[branch.relation];
    const depth = branch.relation === 'root' || branch.relation === 'parent' ? 0
      : branch.relation === 'current' ? 1 : 2;
    const contents = <>
      <span className="hierarchy-card-top">
        <span className="hierarchy-node-icon"><Icon size={14} aria-hidden="true" /></span>
        <strong className="hierarchy-type-name">{name}</strong>
        {selected
          ? <span className="hierarchy-viewing-label">{t('hierarchy.viewing')}</span>
          : <ChevronRight size={13} aria-hidden="true" />}
      </span>
      <span className="sr-only">{relation}</span>
      <span className="hierarchy-part ident">{node.part_number ?? t('hierarchy.noPartNumber')}</span>
      <span className="hierarchy-serial ident">{node.serial_number}</span>
      <span className="hierarchy-card-meta">
        {(archived || status) && (archived
          ? <span className="hierarchy-archived-label">{t('hierarchy.archived')}</span>
          : <span className="equipment-status" data-status={status!.code}>
            {status!.display_name}
          </span>)}
        <span className="hierarchy-location"><MapPin size={12} aria-hidden="true" />{locCode(node.current_location_id)}</span>
      </span>
    </>;
    return <li key={node.id} className="hierarchy-branch" data-depth={depth}>
      {selected
        ? <div ref={selectedRef} className="hierarchy-card" data-selected="true" data-archived={archived} aria-current="true">{contents}</div>
        : <button type="button" className="hierarchy-card" data-archived={archived}
          aria-label={`${t('hierarchy.viewEquipment')} ${name} ${node.serial_number}`} onClick={() => onOpen(node.id)}>{contents}</button>}
      {branch.children.length > 0 && <ol className="hierarchy-children">{branch.children.map((child) => renderBranch(child))}</ol>}
    </li>;
  }

  return <section className="hierarchy-view" aria-label={t('hierarchy.ariaLabel')}>
    <div className="hierarchy-toolbar">
      <div><h3><Network size={17} aria-hidden="true" />{t('hierarchy.connections')}</h3>
        <p>{t('hierarchy.connectionsHint')}</p>
      </div>
      <button type="button" className="hierarchy-center" onClick={() => centerSelected()}><LocateFixed size={15} aria-hidden="true" />{t('hierarchy.centerSelected')}</button>
    </div>
    {breadcrumbChain.length > 0 && (
      <nav className="hierarchy-breadcrumb" aria-label={t('hierarchy.breadcrumbLabel')}>
        {breadcrumbChain.map((node) => (
          <span key={node.id} className="hierarchy-breadcrumb-item">
            <button type="button" onClick={() => onOpen(node.id)}>{crumbLabel(node, typeName)}</button>
            <ChevronRight size={12} aria-hidden="true" />
          </span>
        ))}
        <span className="hierarchy-breadcrumb-item hierarchy-breadcrumb-current" aria-current="page">
          {crumbLabel(current, typeName)}
        </span>
      </nav>
    )}
    <div className="hierarchy-summary">
      <span><strong>{ancestors.length}</strong>{t('hierarchy.ancestors')}</span>
      <span><strong>{directChildren}</strong>{t('hierarchy.directChildren')}</span>
      <span><strong>{descendants.length}</strong>{t('hierarchy.totalDescendants')}</span>
    </div>
    <div ref={canvasRef} className="hierarchy-canvas" tabIndex={0} role="region" aria-label={t('hierarchy.scrollableTree')}>
      <ol ref={treeRef} className="hierarchy-tree">{renderBranch(tree)}</ol>
    </div>
    <div className="hierarchy-caption">
      <span><i aria-hidden="true" />{t('hierarchy.selectedEquipment')}</span>
      <p>{descendants.length === 0
        ? ancestors.length === 0
          ? t('hierarchy.standaloneNote')
          : t('hierarchy.noChildrenNote')
        : t('hierarchy.scrollToExploreNote')}</p>
    </div>
    {(!!current.archived_at || [...ancestors, ...descendants].some((node) => node.archived_at)) && <p className="hierarchy-archive-note">
      {t('hierarchy.archiveNote')}
    </p>}
  </section>;
}
