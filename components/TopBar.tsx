'use client';

import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Menu, SlidersHorizontal } from 'lucide-react';
import { PreferenceControls } from '@/components/Preferences';
import { JabilLogo } from '@/components/JabilLogo';
import { UserMenu } from '@/components/UserMenu';
import { NotificationBell } from '@/components/NotificationBell';

type TopBarProps = {
  username: string;
  fullName: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  toggleRef: RefObject<HTMLButtonElement>;
};

export function TopBar({ username, fullName, sidebarOpen, onToggleSidebar, toggleRef }: TopBarProps) {
  const { t } = useTranslation();
  const toggleLabel = sidebarOpen ? t('nav.hideMenu') : t('nav.openMenu');
  return (
    <header className="app-topbar">
      <div className="app-brand">
        <div className="app-brand-row">
          <JabilLogo />
          <span className="app-brand-title" title="SolarEdge Equipment Management">SolarEdge Equipment Management</span>
          {/* Hamburger — mobile only (CSS-hidden above 800px). The sidebar's
              own collapse toggle handles the desktop case; see AppSidebar. */}
          <button ref={toggleRef} type="button" className="sidebar-toggle"
            onClick={onToggleSidebar} aria-expanded={sidebarOpen} aria-controls="app-sidebar-panel"
            aria-label={toggleLabel} title={toggleLabel}>
            {sidebarOpen ? <ChevronLeft size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* The current page's own name lives in its PageHeading (the <h1> in
          the page body), so the header doesn't repeat it — a breadcrumb
          here used to duplicate that title, and at medium widths it
          collapsed down to literally just the page name a second time. */}
      <div className="topbar-actions">
        <div className="topbar-preferences"><PreferenceControls /></div>
        <details className="topbar-preferences-menu" onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}>
          <summary aria-label={t('theme.preferences')} title={t('theme.preferences')}>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </summary>
          <div className="topbar-preferences-popover"><PreferenceControls /></div>
        </details>
        <NotificationBell />
        <UserMenu username={username} fullName={fullName} />
      </div>
    </header>
  );
}
