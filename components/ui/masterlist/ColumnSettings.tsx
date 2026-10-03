'use client';

/**
 * Tùy chọn hiển thị cột — mỗi người tự ẩn / hiện, đổi thứ tự, khôi phục mặc
 * định. Mặc định hiện đủ cột. Lưu trên trình duyệt của từng người.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui';

export type ColumnPrefs = {
  order: string[];
  hidden: string[];
  toggle: (key: string) => void;
  move: (key: string, delta: -1 | 1) => void;
  reset: () => void;
};

export function useColumnPrefs(storageKey: string, keys: string[]): ColumnPrefs {
  const storage = `masterlist-columns:${storageKey}`;
  const [order, setOrder] = useState<string[]>(keys);
  const [hidden, setHidden] = useState<string[]>([]);
  const keySig = keys.join('|');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storage) ?? 'null') as { order?: string[]; hidden?: string[] } | null;
      if (saved?.order) {
        // Cột mới thêm sau này vẫn hiện (nối vào cuối).
        const known = saved.order.filter((k) => keys.includes(k));
        setOrder([...known, ...keys.filter((k) => !known.includes(k))]);
      } else {
        setOrder(keys);
      }
      setHidden((saved?.hidden ?? []).filter((k) => keys.includes(k)));
    } catch {
      setOrder(keys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, keySig]);

  const persist = useCallback((nextOrder: string[], nextHidden: string[]) => {
    try { localStorage.setItem(storage, JSON.stringify({ order: nextOrder, hidden: nextHidden })); } catch {}
  }, [storage]);

  return {
    order,
    hidden,
    toggle: (key) => {
      const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
      setHidden(next);
      persist(order, next);
    },
    move: (key, delta) => {
      const i = order.indexOf(key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j]!, next[i]!];
      setOrder(next);
      persist(next, hidden);
    },
    reset: () => {
      setOrder(keys);
      setHidden([]);
      try { localStorage.removeItem(storage); } catch {}
    },
  };
}

export function ColumnSettings({ columns, prefs }: { columns: { key: string; label: string }[]; prefs: ColumnPrefs }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="ml-colsettings" ref={ref}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Columns3 size={14} aria-hidden="true" />{t('ml.columns')}
      </Button>
      {open && (
        <div className="ml-popover" role="dialog" aria-label={t('ml.columns')}>
          <ul>
            {prefs.order.map((key, i) => {
              const col = columns.find((c) => c.key === key);
              if (!col) return null;
              return (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={!prefs.hidden.includes(key)} onChange={() => prefs.toggle(key)} />
                    <span>{col.label}</span>
                  </label>
                  <button type="button" onClick={() => prefs.move(key, -1)} disabled={i === 0} aria-label={t('ml.moveUp', { name: col.label })}>
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => prefs.move(key, 1)} disabled={i === prefs.order.length - 1} aria-label={t('ml.moveDown', { name: col.label })}>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Button size="sm" onClick={prefs.reset}>{t('ml.resetColumns')}</Button>
        </div>
      )}
    </div>
  );
}
