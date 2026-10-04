'use client';

import { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '@/lib/client/api';

/**
 * GET cho một vùng màn hình: dữ liệu, đang tải, lỗi (đã dịch), tải lại. Giữ
 * dữ liệu cũ khi tải lại / đổi bộ lọc; URL đổi hoặc vùng đóng thì bỏ qua phản
 * hồi cũ. `url = null`: chưa tải. Vùng chuyển sang bản ghi khác mà vẫn mở thì
 * đặt `key` theo id để không hiện dữ liệu của bản ghi trước.
 */
export function useFetch<T>(url: string | null) {
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(url !== null);
  const [version, reload] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (url === null) { setLoading(false); return; }
    let current = true;
    setLoading(true);
    setError(null);
    api.get<T>(url)
      .then((r) => { if (current) setData(r.data); }, (e: unknown) => { if (current) setError(e); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [url, version]);

  return { data, setData, loading, error: error === null ? null : errorMessage(error, t), reload };
}
