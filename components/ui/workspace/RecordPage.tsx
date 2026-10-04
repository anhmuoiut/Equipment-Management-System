'use client';

/**
 * Detail Page — cùng nội dung Detail Panel nhưng toàn trang (nút ⤢, link QR).
 * Tải một bản ghi theo id; module vẽ chi tiết bằng chính component của panel.
 */
import { useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useFetch } from '@/lib/client/useFetch';
import type { DetailCtx } from './ModuleWorkspace';

export function RecordPage<R extends { id: string }>({ url, listPath, children }: {
  url: string;
  /** Masterlist của module — ✕ quay về đó, mở đúng bản ghi. */
  listPath: string;
  children: (ctx: DetailCtx<R>) => ReactNode;
}) {
  const router = useRouter();
  const { data: row, setData: setRow, loading, error, reload } = useFetch<R>(url);
  const leaveRef = useRef<((proceed: () => void) => void) | null>(null);

  return (
    <div className="record-page">
      {children({
        row, creating: false, loading, error, onRetry: reload, nav: {},
        onClose: () => router.push(row ? `${listPath}?id=${row.id}` : listPath),
        onSaved: (saved) => setRow(saved),
        onDeleted: () => router.push(listPath),
        open: (id) => router.push(`${listPath}/${id}`),
        create: (defaults) => router.push(`${listPath}?new=1${defaults ? `&defaults=${encodeURIComponent(JSON.stringify(defaults))}` : ''}`),
        leaveRef,
      })}
    </div>
  );
}
