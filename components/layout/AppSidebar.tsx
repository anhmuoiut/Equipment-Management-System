'use client';

/**
 * Main navigation — one owner for the sidebar (ui-requirements.md 3.2,
 * extracted out of components/TopBar.tsx). Renders as a docked 240px/72px
 * rail on desktop (driven by AppShell's collapse state) or the full
 * expanded content inside the off-canvas mobile drawer — collapse only
 * ever applies on desktop; mobile is shown-or-not, never rail-narrowed.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Archive, ChevronsLeft, LayoutDashboard, LayoutList,
  Users, ListTree, ShieldAlert, Database,
} from 'lucide-react';

export function AppSidebar({
  role, permissions = [], collapsed, onToggleCollapse, onNavigate,
}: {
  role: 'admin' | 'user' | 'viewer';
  /** Non-admin delegated capabilities (master_data.manage / field.manage) —
   *  each admin link below is shown if the role or a permission earns it,
   *  since a delegated non-admin only gets the sections they're granted. */
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
  const isAdmin = role === 'admin';
  const canManageMasterData = isAdmin || permissions.includes('master_data.manage');
  const canManageFields = isAdmin || permissions.includes('field.manage');
  const showAdminSection = isAdmin || canManageMasterData || canManageFields;
  // Equipment Masterlist reads as "current" on its own detail routes too
  // (/equipment/[id]) — distinct from Archived Equipment, which only
  // matches its own exact subtree.
  const onArchived = pathname === '/equipment/archived';
  const onEquipment = !onArchived && (pathname === '/equipment' || pathname.startsWith('/equipment/'));
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
      <Link href="/" className="sidebar-link" aria-current={pathname === '/' ? 'page' : undefined}
        aria-label={t('nav.dashboard')} title={t('nav.dashboard')} onClick={onNavigate}>
        <span className="sidebar-link-icon"><LayoutDashboard size={18} aria-hidden="true" /></span>
        <span className="sidebar-link-label">{t('nav.dashboard')}</span>
      </Link>
      <Link href="/equipment" className="sidebar-link" aria-current={onEquipment ? 'page' : undefined}
        aria-label={t('nav.equipmentMasterlist')} title={t('nav.equipmentMasterlist')} onClick={onNavigate}>
        <span className="sidebar-link-icon"><LayoutList size={18} aria-hidden="true" /></span>
        <span className="sidebar-link-label">{t('nav.equipmentMasterlist')}</span>
      </Link>
      <Link href="/equipment/archived" className="sidebar-link sidebar-link-nested" aria-current={onArchived ? 'page' : undefined}
        aria-label={t('nav.archivedEquipment')} title={t('nav.archivedEquipment')} onClick={onNavigate}>
        <span className="sidebar-link-icon"><Archive size={16} aria-hidden="true" /></span>
        <span className="sidebar-link-label">{t('nav.archivedEquipment')}</span>
      </Link>
    </nav>
    {showAdminSection && (
      <>
        <p className="sidebar-caption mt-6">{t('nav.administration')}</p>
        <nav aria-label={t('nav.administrationNavigation')}>
          {isAdmin && (
            <Link href="/admin/users" className="sidebar-link" aria-current={pathname === '/admin/users' ? 'page' : undefined}
              aria-label={t('nav.usersPermissions')} title={t('nav.usersPermissions')} onClick={onNavigate}>
              <span className="sidebar-link-icon"><Users size={18} aria-hidden="true" /></span>
              <span className="sidebar-link-label">{t('nav.usersPermissions')}</span>
            </Link>
          )}
          {canManageMasterData && (
            <Link href="/admin/master-data" className="sidebar-link" aria-current={pathname === '/admin/master-data' ? 'page' : undefined}
              aria-label={t('nav.masterData')} title={t('nav.masterData')} onClick={onNavigate}>
              <span className="sidebar-link-icon"><Database size={18} aria-hidden="true" /></span>
              <span className="sidebar-link-label">{t('nav.masterData')}</span>
            </Link>
          )}
          {canManageFields && (
            <Link href="/admin/fields" className="sidebar-link" aria-current={pathname === '/admin/fields' ? 'page' : undefined}
              aria-label={t('nav.fieldConfiguration')} title={t('nav.fieldConfiguration')} onClick={onNavigate}>
              <span className="sidebar-link-icon"><ListTree size={18} aria-hidden="true" /></span>
              <span className="sidebar-link-label">{t('nav.fieldConfiguration')}</span>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/errors" className="sidebar-link" aria-current={pathname === '/admin/errors' ? 'page' : undefined}
              aria-label={t('nav.errorLog')} title={t('nav.errorLog')} onClick={onNavigate}>
              <span className="sidebar-link-icon"><ShieldAlert size={18} aria-hidden="true" /></span>
              <span className="sidebar-link-label">{t('nav.errorLog')}</span>
            </Link>
          )}
        </nav>
      </>
    )}
    <div className="sidebar-note"><span className="sidebar-status" /><span>{t('nav.equipmentControlSystem')}</span></div>
  </aside>;
}
