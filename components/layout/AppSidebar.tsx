'use client';

/**
 * Main navigation — one owner for the sidebar (ui-requirements.md 3.2,
 * extracted out of components/TopBar.tsx). Renders as a docked 240px/72px
 * rail on desktop (driven by AppShell's collapse state) or the full
 * expanded content inside the off-canvas mobile drawer — collapse only
 * ever applies on desktop; mobile is shown-or-not, never rail-narrowed.
 *
 * Workspace pages sit on one flat level. Administration is a single
 * disclosure (the WAI-ARIA APG "disclosure navigation" pattern: a real
 * button with aria-expanded, not role="menu") whose categories are the only
 * second level; a category with several pages switches between them with
 * the page's own tab strip (components/admin/AdminNav), never a third
 * sidebar tier.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Archive, ChevronDown, ChevronsLeft, Gauge, LayoutDashboard, LayoutList, Medal, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  ADMIN_SECTION_PATHS, accessibleAdminCategories, adminCategoryOf, adminSectionAt, roleHasPermission,
} from '@/lib/permissions';
import { ADMIN_CATEGORY_NAV } from '@/components/admin/adminNavigation';

const page = (active: boolean) => (active ? 'page' as const : undefined);

export function AppSidebar({
  role, permissions = [], collapsed, onToggleCollapse, onNavigate,
}: {
  role: 'admin' | 'user' | 'viewer';
  /** Non-admin grants — admin categories and the Calibration page are shown
   *  if the role or a permission earns them, since a delegated non-admin
   *  only gets the sections they're granted. */
  permissions?: string[];
  /** Desktop-only: narrows to an icon rail instead of hiding (mobile always
   *  renders expanded — it's an off-canvas drawer, shown or not at all). */
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const collapseLabel = collapsed ? t('nav.openMenu') : t('nav.hideMenu');
  // Equipment Masterlist reads as "current" on its own detail routes too
  // (/equipment/[id]) — distinct from Archived Equipment, which only
  // matches its own exact subtree.
  const onArchived = pathname === '/equipment/archived';
  const onEquipment = !onArchived && (pathname === '/equipment' || pathname.startsWith('/equipment/'));

  const adminCategories = accessibleAdminCategories(role, permissions);
  const currentSection = adminSectionAt(pathname);
  const currentCategory = currentSection ? adminCategoryOf(currentSection) : null;
  const inAdmin = currentCategory !== null;
  const [adminOpen, setAdminOpen] = useState(inAdmin);
  const adminPanelRef = useRef<HTMLDivElement>(null);
  const wasInAdmin = useRef(inAdmin);

  // Arriving on an admin page from elsewhere (a bookmark, /admin's redirect)
  // opens the group so the current page's link is visible; leaving the
  // admin area keeps whatever the user last chose.
  useEffect(() => {
    if (inAdmin && !wasInAdmin.current) setAdminOpen(true);
    wasInAdmin.current = inAdmin;
  }, [inAdmin]);

  // Closed links stay mounted so the height can animate, but must not take
  // focus or be read out — React 18 has no `inert` prop, so set it here.
  useEffect(() => {
    if (adminPanelRef.current) adminPanelRef.current.inert = !adminOpen;
  }, [adminOpen]);

  return <aside className="app-sidebar" aria-label={t('nav.sidebarMenu')}>
    {/* A single icon that CSS rotates 180deg on collapse (data-sidebar-open
        on .app-shell) instead of swapping between two icon components —
        swapping components jump-cuts with no animation, a rotation reads
        as one continuous motion. */}
    <button type="button" className="sidebar-toggle sidebar-collapse-toggle"
      onClick={onToggleCollapse} aria-expanded={!collapsed}
      aria-label={collapseLabel} title={collapseLabel}>
      <ChevronsLeft size={18} aria-hidden="true" />
    </button>
    <p className="sidebar-caption">{t('nav.workspace')}</p>
    <nav aria-label={t('nav.mainNavigation')}>
      <SidebarLink href="/" label={t('nav.dashboard')} icon={LayoutDashboard}
        current={page(pathname === '/')} onNavigate={onNavigate} />
      <SidebarLink href="/equipment" label={t('nav.equipmentMasterlist')} icon={LayoutList}
        current={page(onEquipment)} onNavigate={onNavigate} />
      <SidebarLink href="/equipment/archived" label={t('nav.archivedEquipment')} icon={Archive}
        current={page(onArchived)} onNavigate={onNavigate} />
      {roleHasPermission(role, permissions, 'calibration.view') && (
        <SidebarLink href="/calibration" label={t('nav.calibration')} icon={Gauge}
          current={page(pathname === '/calibration')} onNavigate={onNavigate} />
      )}
      <SidebarLink href="/golden-master" label={t('nav.goldenMasterList')} icon={Medal} badge={t('nav.soon')}
        current={page(pathname === '/golden-master')} onNavigate={onNavigate} />
    </nav>
    {adminCategories.length > 0 && (
      <>
        <div className="sidebar-divider" aria-hidden="true" />
        <nav aria-label={t('nav.administrationNavigation')}>
          <div className="sidebar-group" data-open={adminOpen}>
            <button type="button" className="sidebar-link sidebar-group-toggle"
              aria-expanded={adminOpen} aria-controls="sidebar-admin-panel"
              aria-label={t('nav.adminMenu')} title={t('nav.adminMenu')}
              data-current={inAdmin || undefined}
              onClick={() => setAdminOpen((open) => !open)}>
              <span className="sidebar-link-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
              <span className="sidebar-link-label sidebar-link-label--split">
                <span className="sidebar-link-text">{t('nav.adminMenu')}</span>
                <ChevronDown size={16} aria-hidden="true" className="sidebar-group-chevron" />
              </span>
            </button>
            <div id="sidebar-admin-panel" ref={adminPanelRef} className="sidebar-group-panel">
              <div className="sidebar-group-clip">
                <div className="sidebar-group-list">
                  {adminCategories.map(({ category, sections }) => {
                    const href = ADMIN_SECTION_PATHS[sections[0]!];
                    const { labelKey, icon } = ADMIN_CATEGORY_NAV[category];
                    return (
                      // A category links to its first page; on its other
                      // pages it is the current *item* rather than the
                      // current page (aria-current="true", same styling).
                      <SidebarLink key={category} href={href} label={t(labelKey)} icon={icon} nested
                        current={pathname === href ? 'page' : category === currentCategory ? 'true' : undefined}
                        onNavigate={onNavigate} />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </nav>
      </>
    )}
    <div className="sidebar-note"><span className="sidebar-status" /><span>{t('nav.equipmentControlSystem')}</span></div>
  </aside>;
}

function SidebarLink({
  href, label, icon: Icon, current, nested = false, badge, onNavigate,
}: {
  href: string; label: string; icon: LucideIcon;
  current?: 'page' | 'true'; nested?: boolean;
  /** Short status next to the label, e.g. "Soon" for a page still in development. */
  badge?: string;
  onNavigate: () => void;
}) {
  // The accessible name is explicit because the icon-only rail hides the
  // visible label — so it has to carry the badge's meaning too.
  const name = badge ? `${label} (${badge})` : label;
  return (
    <Link href={href} className={nested ? 'sidebar-link sidebar-link-nested' : 'sidebar-link'}
      aria-current={current} aria-label={name} title={name} onClick={onNavigate}>
      <span className="sidebar-link-icon"><Icon size={nested ? 16 : 18} aria-hidden="true" /></span>
      {badge ? (
        <span className="sidebar-link-label sidebar-link-label--split">
          <span className="sidebar-link-text">{label}</span>
          <span className="sidebar-link-badge" aria-hidden="true">{badge}</span>
        </span>
      ) : (
        <span className="sidebar-link-label">{label}</span>
      )}
    </Link>
  );
}
