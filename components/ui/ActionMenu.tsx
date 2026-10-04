'use client';

/**
 * Menu of actions behind one button: **Thao tác ▾** in the Detail Panel, ⋮ in
 * the phone list toolbar. A dropdown on desktop; a bottom sheet on phones
 * (rows 48px high). Destructive items sort last, in red.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui';

export type MoreItem = { key: string; label: string; onClick: () => void; danger?: boolean; icon?: ReactNode };

export function ActionMenu({ items, busy, iconOnly, ariaLabel }: {
  items: MoreItem[];
  /** One item is running — the trigger spins and cannot reopen the menu. */
  busy?: boolean;
  /** Icon-only ⋮ trigger (needs `ariaLabel`); default is the text button with a chevron. */
  iconOnly?: boolean;
  ariaLabel?: string;
}) {
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
      <Button size="sm" className={`dp-more-trigger${iconOnly ? ' dp-more-trigger--icon' : ''}`} loading={busy}
        onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={iconOnly ? ariaLabel : undefined}>
        {iconOnly ? <MoreVertical size={18} aria-hidden="true" /> : <>{t('dp.actionsMenu')}<ChevronDown size={14} aria-hidden="true" /></>}
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
