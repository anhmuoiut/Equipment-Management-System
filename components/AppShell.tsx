'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ToastViewport } from '@/components/ui';

const STORAGE_KEY = 'equipment-sidebar-open';
const MOBILE_QUERY = '(max-width: 800px)';
// Pages built on the Masterlist's full-height table (toolbar and footer stay
// put, only rows scroll) — the data-page='masterlist' rules in globals.css.
// Archived equipment is the same list, so it gets the same layout.
const FULL_HEIGHT_LIST_PAGES = new Set(['/equipment', '/equipment/archived', '/calibration']);

export function AppShell({
  username, fullName, role, permissions = [], children,
}: {
  username: string; fullName: string; role: 'admin' | 'user' | 'viewer';
  permissions?: string[]; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = isMobile ? mobileOpen : desktopOpen;

  useEffect(() => {
    try { setDesktopOpen(localStorage.getItem(STORAGE_KEY) !== 'false'); } catch {}
    const media = window.matchMedia(MOBILE_QUERY);
    function syncViewport() {
      setIsMobile(media.matches);
      setMobileOpen(false);
      if (panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    }
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    toggleRef.current?.focus();
  }, []);

  function toggleSidebar() {
    if (isMobile) {
      if (mobileOpen) closeMobile();
      else setMobileOpen(true);
    } else {
      const next = !desktopOpen;
      setDesktopOpen(next);
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
    }
  }

  // The drawer panel stays mounted at all times on mobile now (see the JSX
  // below) so the slide/fade can animate on both open AND close — a node
  // that unmounts the instant `mobileOpen` flips false has no time to run
  // its exit transition. While off-screen it must not be reachable by tab
  // or a screen reader, so it's `inert` whenever mobile-and-closed; never
  // inert on desktop, where it's a real, always-interactive rail.
  useEffect(() => {
    if (!panelRef.current) return;
    panelRef.current.inert = isMobile && !mobileOpen;
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const content = contentRef.current;
    const actions = shellRef.current?.querySelector<HTMLElement>('.topbar-actions');
    const previousOverflow = document.body.style.overflow;
    if (content) content.inert = true;
    if (actions) actions.inert = true;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobile();
      } else if (event.key === 'Tab') {
        // Keep keyboard navigation in the open menu and its header toggle.
        // Links inside a closed sidebar group are inert (not focusable), so
        // they can't be the first/last stop.
        const items = [
          toggleRef.current,
          ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex="0"]',
          ) ?? []),
        ].filter((item): item is HTMLElement => item !== null && !item.closest('[inert]'));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (content) content.inert = false;
      if (actions) actions.inert = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobile, mobileOpen, closeMobile]);

  return (
    <div ref={shellRef} className="app-shell" data-page={FULL_HEIGHT_LIST_PAGES.has(pathname) ? 'masterlist' : undefined} data-mobile-open={mobileOpen} data-sidebar-open={sidebarOpen}>
      {/* Visible only on keyboard focus (ui-requirements.md 3.1) — the
          first focusable element on every page, so Tab from the address
          bar reaches main content without tabbing through the whole header
          and sidebar first. */}
      <a href="#main-content" className="skip-link">{t('nav.skipToContent')}</a>
      <TopBar username={username} fullName={fullName} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} toggleRef={toggleRef} />
      <div className="app-body">
        {/* Mounted for the whole time the viewport is mobile-sized (not just
            while open) so its opacity fade can play on close, not just open —
            see the panel note below for why the same applies there. Visuals
            (opacity/pointer-events) are driven by .app-shell[data-mobile-open]
            in CSS, not by conditional rendering. */}
        {isMobile && <button
          type="button" className="sidebar-backdrop" tabIndex={-1}
          aria-label={t('nav.closeMenu')} onClick={closeMobile}
        />}
        {/* Desktop collapse narrows to an icon rail (styled off data-sidebar-open
            on .app-shell). On mobile this now always stays mounted and slides
            off-screen via transform (CSS) instead of unmounting via `hidden` —
            unmounting on close would skip the close transition entirely. The
            `inert` effect above keeps it out of the tab order/AT while closed. */}
        <div id="app-sidebar-panel" ref={panelRef} className="sidebar-region">
          <AppSidebar
            role={role} permissions={permissions} collapsed={!isMobile && !desktopOpen} onToggleCollapse={toggleSidebar}
            onNavigate={() => { if (isMobile) closeMobile(); }}
          />
        </div>
        <main id="main-content" ref={contentRef} className="app-content" tabIndex={-1}>{children}</main>
      </div>
      <ToastViewport />
    </div>
  );
}
