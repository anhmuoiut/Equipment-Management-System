import type { ReactNode } from 'react';

/**
 * One consistent page-level heading (ui-requirements.md 3.1/5) — replaces
 * six hand-rolled `.dashboard-heading` blocks (Dashboard, Masterlist,
 * Archived, and three Admin pages) that had each grown their own copy of
 * the same title/subtitle/actions layout. `id` lets a page keep an
 * existing heading id for `aria-labelledby` references (e.g. the
 * masterlist keeps `equipment-masterlist-title`).
 */
export function PageHeading({
  id, title, subtitle, actions,
}: { id?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1 id={id}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}
