'use client';

/**
 * Detail Page — cùng nội dung Detail Panel nhưng toàn trang (nút ⤢, link QR).
 * Tải một bản ghi theo id; module vẽ chi tiết bằng chính component của panel.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/client/api';
import { translateError } from '@/lib/i18n/errors';
import type { DetailCtx } from './ModuleWorkspace';

export function RecordPage<R extends { id: string }>({ url, listPath, children }: {
  url: string;
  /** Masterlist của module — ✕ quay về đó, mở đúng bản ghi. */
  listPath: string;
  children: (ctx: DetailCtx<R>) => ReactNode;
}) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const [row, setRow] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const leaveRef = useRef<((proceed: () => void) => void) | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<R>(url).then((r) => setRow(r.data)).catch((e) => { if (e instanceof ApiError) setError(e); }).finally(() => setLoading(false));
  }, [url]);
  useEffect(() => { load(); }, [load]);

  const language = i18n.language === 'vi' ? 'vi' : 'en';
  return (
    <div className="record-page">
      {children({
        row, creating: false, loading, nav: {},
        error: error ? translateError(error.code, language, error.message) : null,
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
