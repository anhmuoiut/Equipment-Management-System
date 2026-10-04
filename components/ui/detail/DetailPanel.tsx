'use client';

/**
 * Khung chi tiết dùng chung (docs/DETAIL_MODEL.md mục 3): header (‹ ›, tên
 * chính, tag, ⤢, ✕; trang riêng: ← thay cho ✕), tab, thân cuộn, footer. Header và tab luôn hiện; chỉ
 * thân cuộn. Cùng một khung cho Detail Panel (bên phải masterlist) và
 * Detail Page (toàn trang, link QR).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { ActionMenu, type MoreItem } from '@/components/ui/ActionMenu';

export type PanelLayout = 'panel' | 'page';

export function DetailPanel({
  layout, title, tags, subtitle, meta, nav, actions, more, moreBusy, onExpand, onClose,
  tabs, activeTab, onTab, footer, mobileBar, children,
}: {
  layout: PanelLayout;
  title: ReactNode;
  tags?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  /** Trước / sau theo thứ tự masterlist. undefined = không có nút. */
  nav?: { onPrev?: () => void; onNext?: () => void };
  actions?: ReactNode;
  more?: MoreItem[];
  /** Một mục của [Thao tác ▾] đang chạy — nút quay, không mở lại được. */
  moreBusy?: boolean;
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
  // Both arrows would be disabled (a single record, or the full page of one record): no dead buttons.
  const showNav = !!(nav && (nav.onPrev || nav.onNext));
  return (
    <aside className="dp" data-layout={layout} aria-label={typeof title === 'string' ? title : undefined}>
      <header className="dp-header" data-nav={showNav || undefined}>
        <div className="dp-header-row">
          {onClose && (
            <button type="button" className="dp-icon-btn dp-back" onClick={onClose} aria-label={t('dp.back')}>
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          {showNav && nav && (
            <div className="dp-nav">
              <button type="button" className="dp-icon-btn" onClick={nav.onPrev} disabled={!nav.onPrev} aria-label={t('dp.prev')} title={t('dp.prev')}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="dp-icon-btn" onClick={nav.onNext} disabled={!nav.onNext} aria-label={t('dp.next')} title={t('dp.next')}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="dp-title">
            <h2>{title}</h2>
            {tags && <div className="dp-tags">{tags}</div>}
          </div>
          <div className="dp-actions">
            {actions}
            {more && more.length > 0 && <ActionMenu items={more} busy={moreBusy} />}
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
        {(subtitle || meta) && (
          <div className="dp-sub">
            {subtitle && <div className="dp-subtitle">{subtitle}</div>}
            {meta && <div className="dp-meta">{meta}</div>}
          </div>
        )}
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
