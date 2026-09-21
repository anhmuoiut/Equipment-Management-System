'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, Loader2, RotateCcw, TriangleAlert, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Button({
  children, variant = 'quiet', size = 'md', loading, disabled, ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  /** Shows a spinner in place of nothing and disables the button — the one
   *  loading treatment every async action button in the app should use, so
   *  a click can never be a silent no-op and a second click can never fire
   *  a duplicate request while the first is still in flight. */
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]';
  const style =
    variant === 'primary'
      ? { background: 'var(--machine)', color: '#fff', borderColor: 'var(--machine)' }
      : variant === 'danger'
        ? { background: 'transparent', color: 'var(--alert)', borderColor: 'var(--alert)' }
        : { background: 'var(--panel)', color: 'var(--ink)', borderColor: 'var(--rule)' };

  // Explicit per-variant hover/pressed state (ui-requirements.md 2.4) —
  // replaces the removed global `button:hover { filter: brightness(.97) }`,
  // which applied a uniform darken to every button regardless of variant
  // and didn't distinguish hover from pressed.
  const stateClass =
    variant === 'primary' ? 'ui-button--primary'
      : variant === 'danger' ? 'ui-button--danger'
        : 'ui-button--quiet';

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={{ ...style, ...rest.style }}
      className={`ui-button ui-button--${size} ${stateClass} border font-medium disabled:opacity-40 ${pad} ${rest.className ?? ''}`}
    >
      {loading && <Loader2 size={size === 'sm' ? 13 : 15} aria-hidden="true" className="ui-spin" />}
      {children}
    </button>
  );
}

/** Trạng thái không bao giờ chỉ bằng màu — sàn xưởng, ánh sáng mạnh, in đen trắng. */
export function Tag({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'warn' | 'ok' }) {
  const c =
    tone === 'warn'
      ? { background: 'var(--warn-tint)', color: 'var(--warn)', borderColor: 'var(--warn)' }
      : tone === 'ok'
        ? { background: 'var(--machine-tint)', color: 'var(--ok)', borderColor: 'var(--ok)' }
        : { background: 'transparent', color: 'var(--ink-2)', borderColor: 'var(--rule)' };
  return (
    <span className="ui-tag border px-1.5 py-[1px] text-[11px] font-medium" style={c}>
      {text}
    </span>
  );
}

export function Notice({
  tone, children, onDismiss, dismissLabel,
}: { tone: 'warn' | 'alert' | 'info'; children: ReactNode; onDismiss?: () => void; dismissLabel?: string }) {
  const { t } = useTranslation();
  const c =
    tone === 'alert'
      ? { borderColor: 'var(--alert)', background: 'var(--alert-tint)', color: 'var(--alert)' }
      : tone === 'warn'
        ? { borderColor: 'var(--warn)', background: 'var(--warn-tint)', color: 'var(--warn)' }
        : { borderColor: 'var(--machine)', background: 'var(--machine-tint)', color: 'var(--ok)' };
  return (
    <div className="flex items-start gap-3 border-l-2 py-2 pl-3 pr-2 text-[13px]" style={c}>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-[11px] underline" style={{ color: 'inherit' }}>
          {dismissLabel ?? t('common.close')}
        </button>
      )}
    </div>
  );
}

export function Modal({
  open, title, onClose, children, wide, footer,
}: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean;
  /** Action buttons pinned below the scrolling body — so Save/Cancel stay
   *  reachable on a long form instead of scrolling away with the content. */
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass an inline `onClose`, a fresh function identity on every
  // render (e.g. every keystroke in a field this modal contains). Reading
  // it through a ref updated on every render — instead of depending on it
  // directly — keeps the effect below from treating "the caller re-rendered"
  // as "something about the modal changed" and re-grabbing focus mid-type.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        )).filter((element) => element.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
    // Intentionally just `open` — see onCloseRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay"
         data-action-dialog="true"
         style={{ background: 'rgba(18,25,26,0.35)' }}
         onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`modal-dialog ${wide ? 'modal-dialog--wide' : ''}`}
        style={{ background: 'var(--panel)', borderColor: 'var(--rule)', color: 'var(--ink)' }}
      >
        <div className="modal-header"><h2>{title}</h2><button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}><X size={20} aria-hidden="true" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** The one rotating loading indicator in the app — `size` picks how loud it
 *  reads: 'sm' inline next to a short status line, 'md' filling a table/
 *  panel body, 'lg' for a full-page initial load. Continuous rotation via
 *  the shared `.ui-spin` keyframe (also used by Button's loading state),
 *  which the app-wide `prefers-reduced-motion` rule in globals.css already
 *  flattens to near-instant — no extra work needed here for that. */
export function Spinner({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 16 : size === 'lg' ? 32 : 22;
  const pad = size === 'lg' ? 'py-16' : size === 'sm' ? 'py-2' : 'py-8';
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${pad}`} role="status" aria-live="polite">
      <Loader2 size={px} aria-hidden="true" className="ui-spin" style={{ color: 'var(--machine)' }} />
      <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

/** Full-page initial load — same visual weight everywhere a page has
 *  nothing to show yet (no stale/cached content to keep displaying). Keep
 *  the app shell (header/sidebar) mounted around this; never replace the
 *  whole screen with it. */
export function PageLoader({ label }: { label: string }) {
  return <Spinner label={label} size="lg" />;
}

/** A single placeholder block — compose a few into a shape that roughly
 *  matches the real content (a KPI card, a table row) so nothing jumps
 *  when the real content swaps in. Shimmer respects prefers-reduced-motion
 *  via the same global rule as everything else animated in this app. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`ui-skeleton ${className ?? ''}`} style={style} aria-hidden="true" />;
}

/** N skeleton rows matching a table's real column count — for re-fetches
 *  (search/filter/sort/page) where the table shouldn't collapse to a bare
 *  spinner and lose its shape. Only for genuinely empty-so-far tables; a
 *  table that already has rows should just keep showing them while a
 *  background refetch runs (see the `loading && rows.length===0` pattern
 *  used across the admin/equipment list pages). */
export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}><Skeleton className="h-4" style={{ width: c === 0 ? '60%' : '85%' }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Covers just its positioned parent (not the whole viewport) while a
 *  critical, must-not-be-interrupted operation runs — Swap, Archive,
 *  bulk import commit. The dialog/panel stays visible underneath, dimmed
 *  and unclickable, with a short reason so a multi-second wait doesn't
 *  read as a freeze. Parent needs `position: relative`. */
export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="ui-loading-overlay" role="status" aria-live="polite">
      <Loader2 size={22} aria-hidden="true" className="ui-spin" style={{ color: 'var(--machine)' }} />
      <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{label}</span>
    </div>
  );
}

/** Standard "nothing here" block — a table/list with zero rows, whether
 *  that's genuinely empty or a search/filter matched nothing. `action`
 *  is the one relevant next step (Clear filters, Add the first one), not
 *  a general-purpose button slot. */
export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-[14px]">{title}</p>
      {subtitle && <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Standard "a GET failed" block — never leaves a blank page/panel behind
 *  a failed fetch. `message` should already be the translated, user-safe
 *  text (translateError's job, not this component's); the raw error goes
 *  to error_log server-side, never here. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-[14px]" style={{ color: 'var(--alert)' }}>{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry} className="mt-3">
          <RotateCcw size={13} aria-hidden="true" />{t('common.retry')}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOAST — a global, imperative notification queue instead of a React
// Context, since a toast is fired from event handlers scattered across the
// whole app (every save/delete/archive), not read from component state.
// `toast.success(...)` etc. work from anywhere; `<ToastViewport />` (mounted
// once, in AppShell) is the only thing that actually renders them. Auto-
// dismiss keeps the queue from growing unbounded even if nobody clicks the
// dismiss button; an identical {tone, message} already showing is not
// re-queued, so a doubled event (e.g. a fast double-click that still only
// sends one request) can't stack two identical toasts.
// ---------------------------------------------------------------------------

type ToastTone = 'success' | 'info' | 'warning' | 'error';
type ToastItem = { id: string; tone: ToastTone; message: string };

let toastItems: ToastItem[] = [];
let toastListeners: ((items: ToastItem[]) => void)[] = [];

function emitToasts() {
  for (const listener of toastListeners) listener(toastItems);
}

function dismissToast(id: string) {
  toastItems = toastItems.filter((item) => item.id !== id);
  emitToasts();
}

function pushToast(tone: ToastTone, message: string) {
  if (toastItems.some((item) => item.tone === tone && item.message === message)) return;
  const id = crypto.randomUUID();
  toastItems = [...toastItems, { id, tone, message }];
  emitToasts();
  setTimeout(() => dismissToast(id), 4500);
}

export const toast = {
  success: (message: string) => pushToast('success', message),
  info: (message: string) => pushToast('info', message),
  warning: (message: string) => pushToast('warning', message),
  error: (message: string) => pushToast('error', message),
};

const TOAST_ICON: Record<ToastTone, typeof Info> = {
  success: CheckCircle2, info: Info, warning: TriangleAlert, error: XCircle,
};

/** Mount exactly once (AppShell) — every `toast.*()` call anywhere in the
 *  app renders through this single portaled stack, top-right, above
 *  everything including open modals. */
export function ToastViewport() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>(toastItems);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => { toastListeners = toastListeners.filter((l) => l !== setItems); };
  }, []);

  if (items.length === 0) return null;
  return createPortal(
    <div className="toast-viewport">
      {items.map((item) => {
        const Icon = TOAST_ICON[item.tone];
        return (
          <div key={item.id} className="toast-item" data-tone={item.tone} role="status">
            <Icon size={16} aria-hidden="true" className="toast-item-icon" />
            <span className="toast-item-message">{item.message}</span>
            <button type="button" onClick={() => dismissToast(item.id)} aria-label={t('common.close')} className="toast-item-close">
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/** The one visual marker for "this field is required" — matches
 *  DynamicForm's equipment-field asterisk, so every hand-written admin form
 *  uses the same convention instead of relying on the browser's native
 *  validation popup to be the only sign a field wasn't optional. */
export function RequiredMark() {
  return <span style={{ color: 'var(--alert)' }} aria-hidden="true"> *</span>;
}

/** Styled confirmation dialog for a destructive/consequential action — the
 *  one place in the app that should ever ask "are you sure", instead of
 *  each call site choosing between this and the browser's own
 *  `window.confirm()` (unstyled, blocks the whole tab, can't show rich
 *  copy). `tone` picks the confirm button's variant: 'danger' for anything
 *  that deletes or archives, 'primary' for anything reversible. */
export function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel, tone = 'danger', busy, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open} title={title} onClose={onCancel}
      footer={
        <>
          <Button type="button" disabled={busy} onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</Button>
          <Button type="button" variant={tone} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{description}</p>
    </Modal>
  );
}
