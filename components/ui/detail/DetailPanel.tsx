'use client';

/**
 * Khung chi tiết dùng chung (docs/DETAIL_MODEL.md mục 3): header (‹ ›, tên
 * chính, tag, ⤢, ✕), tab, thân cuộn, footer. Header và tab luôn hiện; chỉ
 * thân cuộn. Cùng một khung cho Detail Panel (bên phải masterlist) và
 * Detail Page (toàn trang, link QR).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui';

export type PanelLayout = 'panel' | 'page';

export function DetailPanel({
  layout, icon, title, tags, subtitle, meta, nav, actions, more, onExpand, onClose,
  tabs, activeTab, onTab, footer, mobileBar, children,
}: {
  layout: PanelLayout;
  icon?: ReactNode;
  title: ReactNode;
  tags?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  /** Trước / sau theo thứ tự masterlist. undefined = không có nút. */
  nav?: { onPrev?: () => void; onNext?: () => void };
  actions?: ReactNode;
  more?: MoreItem[];
  onExpand?: () => void;
  onClose?: () => void;
  tabs?: { key: string; label: string }[];
  activeTab?: string;
  onTab?: (key: string) => void;
  footer?: ReactNode;
  /** Thanh đáy trên điện thoại khi xem (‹ nút chính ›). */
  mobileBar?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <aside className="dp" data-layout={layout} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="dp-header">
        <div className="dp-header-row">
          {onClose && (
            <button type="button" className="dp-icon-btn dp-back" onClick={onClose} aria-label={t('dp.back')}>
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          {nav && (
            <div className="dp-nav">
              <button type="button" className="dp-icon-btn" onClick={nav.onPrev} disabled={!nav.onPrev} aria-label={t('dp.prev')} title={t('dp.prev')}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="dp-icon-btn" onClick={nav.onNext} disabled={!nav.onNext} aria-label={t('dp.next')} title={t('dp.next')}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          {icon && <span className="dp-module-icon" aria-hidden="true">{icon}</span>}
          <div className="dp-title">
            <h2>{title}</h2>
            {tags && <div className="dp-tags">{tags}</div>}
          </div>
          <div className="dp-actions">
            {actions}
            {more && more.length > 0 && <MoreMenu items={more} />}
            {onExpand && (
              <button type="button" className="dp-icon-btn dp-expand" onClick={onExpand} aria-label={t('dp.expand')} title={t('dp.expand')}>
                <Maximize2 size={16} aria-hidden="true" />
              </button>
            )}
            {onClose && (
              <button type="button" className="dp-icon-btn dp-close" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {subtitle && <div className="dp-subtitle">{subtitle}</div>}
        {meta && <div className="dp-meta">{meta}</div>}
        {tabs && tabs.length > 1 && (
          <div className="dp-tabs" role="tablist">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
                className="dp-tab" onClick={() => onTab?.(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="dp-body">{children}</div>
      {footer ? <footer className="dp-footer">{footer}</footer> : mobileBar ? <footer className="dp-mobilebar">{mobileBar}</footer> : null}
    </aside>
  );
}

export type MoreItem = { key: string; label: string; onClick: () => void; danger?: boolean; icon?: ReactNode };

/**
 * Nút **Thao tác ▾** (có chữ — nút chỉ có dấu ⋯ dễ bị bỏ qua) mở danh sách thao
 * tác; Xóa luôn ở cuối, màu đỏ. Trên điện thoại mở từ đáy màn hình.
 */
export function MoreMenu({ items }: { items: MoreItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const sorted = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];
  return (
    <div className="dp-more" ref={ref}>
      <Button size="sm" className="dp-more-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        {t('dp.actionsMenu')}<ChevronDown size={14} aria-hidden="true" />
      </Button>
      {open && (
        <>
          <div className="dp-more-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul className="dp-more-list" role="menu">
            {sorted.map((item) => (
              <li key={item.key} role="none">
                <button type="button" role="menuitem" data-danger={item.danger || undefined}
                  onClick={() => { setOpen(false); item.onClick(); }}>
                  {item.icon}{item.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Một nhóm trường: tiêu đề nhỏ viết hoa + lưới 2 cột. */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dp-section">
      <h3 className="dp-section-title">{title}</h3>
      <div className="dp-grid">{children}</div>
    </section>
  );
}

/** Một trường khi xem: nhãn ở trên, giá trị ở dưới; trống → —. */
export function DetailValue({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="dp-field" data-wide={wide || undefined}>
      <span className="dp-label">{label}</span>
      <div className="dp-value">{empty ? <span className="dp-empty">—</span> : children}</div>
      {hint && <span className="dp-hint">{hint}</span>}
    </div>
  );
}
