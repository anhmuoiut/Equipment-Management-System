'use client';

/**
 * The one searchable dropdown for choosing from a list — select fields in
 * the Detail Panel, action screens (new location / parent / swap target,
 * calibration status / vendor) and Account settings. One component means
 * one look, one keyboard behavior and one search behavior everywhere.
 *
 * Renders as a button + a small listbox popover. The popover is portaled
 * to `document.body` and positioned from the trigger's own bounding box
 * (recomputed on scroll/resize while open) so it always escapes whatever
 * `overflow: hidden/auto` container it opens inside (the panel body, a modal).
 *
 * Phones: a bottom sheet with 48px rows instead — a popover under a small
 * field gets covered by the keyboard. The search box shows only for long lists
 * and is not focused automatically, so the keyboard doesn't open by itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Modal } from '@/components/ui';
import { usePhone } from '@/lib/client/usePhone';

export type SelectOption = { value: string; label: string; disabled?: boolean };

/** Phone sheet: show the search box only above this many options. */
const SEARCH_FROM = 7;

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Shows the placeholder as a selectable "clear" row at the top of the list. */
  clearable?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function SearchableSelect({
  value, onChange, options, placeholder, ariaLabel, disabled, clearable, className, style,
}: Props) {
  const { t } = useTranslation();
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(Math.max(r.width, 220), window.innerWidth - margin * 2);
    const below = window.innerHeight - r.bottom - margin - 4;
    const above = r.top - margin - 4;
    const openAbove = below < 240 && above > below;
    setRect({
      ...(openAbove ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      left: Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)),
      width,
      maxHeight: Math.max(0, openAbove ? above : below),
    });
  }

  function openMenu() {
    if (disabled) return;
    updatePosition();
    setQuery('');
    setHighlight(0);
    setOpen(true);
  }

  // Popover only (desktop): outside click, reposition, focus the search box. The phone sheet is a Modal.
  useEffect(() => {
    if (!open || phone) return;
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() { updatePosition(); }
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
      cancelAnimationFrame(frame);
    };
  }, [open, phone]);

  useEffect(() => { setHighlight(0); }, [query]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) commit(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <>
      <button
        type="button" ref={triggerRef} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex items-center justify-between gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
        style={{ borderColor: 'var(--rule)', background: 'var(--panel)', color: 'var(--ink)', ...style }}
      >
        <span className="min-w-0 flex-1 truncate" style={!selected ? { color: 'var(--ink-3)' } : undefined}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
      </button>

      {open && phone && createPortal(
        <Modal sheet title={ariaLabel ?? placeholder ?? ''} onClose={() => { setOpen(false); triggerRef.current?.focus(); }}>
          {options.length > SEARCH_FROM && (
            <label className="ss-search">
              <Search size={16} aria-hidden="true" />
              <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.searchPlaceholder')} aria-label={t('common.search')} />
            </label>
          )}
          <div role="listbox" aria-label={ariaLabel} className="ss-options">
            {clearable && (
              <button type="button" role="option" aria-selected={value === ''} className="ss-option ss-option--clear" onClick={() => commit('')}>
                {placeholder}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="ss-empty">{t('common.noOptionsFound')}</p>
            ) : filtered.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} disabled={o.disabled}
                className="ss-option" onClick={() => commit(o.value)}>
                <span>{o.label}</span>
                {o.value === value && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </Modal>,
        document.body,
      )}

      {open && !phone && rect && createPortal(
        <div
          ref={popoverRef}
          // z-[100] must stay above every other fixed-position layer in the
          // app — the equipment detail panel's own overlay is z-index 80,
          // and a lower value here renders the popover invisible behind it.
          className="fixed z-[100] flex flex-col overflow-hidden rounded-md border shadow-lg"
          style={{ ...rect, borderColor: 'var(--rule)', background: 'var(--panel)' }}
          // This popover is portaled to document.body, so any mousedown
          // inside it (search input, an option) would otherwise bubble past
          // a parent popover that listens for outside clicks on `document`,
          // closing that ancestor before the click/commit below ever fires
          // and silently dropping the selection.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: 'var(--rule-soft)' }}>
            <Search size={13} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <input
              ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
              placeholder={t('common.searchPlaceholder')} aria-label={t('common.search')}
              className="w-full min-w-0 border-0 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          <div role="listbox" aria-label={ariaLabel} className="min-h-0 max-h-56 overflow-y-auto py-1">
            {clearable && (
              <button
                type="button" role="option" aria-selected={value === ''}
                onMouseDown={(e) => e.preventDefault()} onClick={() => commit('')}
                className="flex w-full items-center px-2.5 py-1.5 text-left text-[13px]"
                style={{ color: 'var(--ink-3)', background: value === '' ? 'var(--machine-tint)' : 'transparent' }}
              >
                {placeholder}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-center text-[12px]" style={{ color: 'var(--ink-3)' }}>
                {t('common.noOptionsFound')}
              </p>
            ) : filtered.map((o, i) => (
              <button
                key={o.value} type="button" role="option" aria-selected={o.value === value} disabled={o.disabled}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHighlight(i)} onClick={() => commit(o.value)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: i === highlight ? 'var(--surface)' : 'transparent', color: 'var(--ink)' }}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {o.value === value && <Check size={13} aria-hidden="true" style={{ color: 'var(--ok)', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
