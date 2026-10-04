import type { ReactNode } from 'react';

/** Tiêu đề trang dùng chung (Dashboard, Masterlist của mọi module) — đúng một h1 mỗi trang. */
export function PageHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
