'use client';

/**
 * The fixed overlay + dialog frame an equipment record opens in from a list
 * (Equipment Masterlist, Calibration). While open it locks page scroll,
 * makes the list behind it inert, keeps Tab inside the dialog and, on
 * close, hands focus back to whatever opened it (the clicked row).
 *
 * `focusKey` re-runs that focus handling when the dialog switches to another
 * record (the detail's onOpenOther) — the previous record's focused control
 * is gone by then, so the dialog itself takes focus again.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

export function EquipmentDetailOverlay({
  label, focusKey, backgroundRef, onClose, children,
}: {
  /** Accessible name of the dialog. */
  label: string;
  focusKey: string;
  /** The list behind the dialog — inert while it's open. */
  backgroundRef: RefObject<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = backgroundRef.current;
    document.body.style.overflow = 'hidden';
    if (background) background.inert = true;
    dialogRef.current?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      if (event.target instanceof HTMLElement && event.target.closest('[data-action-dialog]')) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      )).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      if (background) background.inert = false;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [focusKey, backgroundRef]);

  return (
    <div
      className="equipment-detail-overlay"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="equipment-detail-dialog"
        style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
