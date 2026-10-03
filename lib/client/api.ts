'use client';

/**
 * API client. Mọi lỗi từ server có { code, message, request_id } — giữ
 * request_id để người dùng đọc cho Admin khi báo lỗi.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Lỗi theo từng trường, để gắn vào ô nhập tương ứng. */
  get fieldErrors(): Record<string, string> {
    const f = this.details.fields;
    return f && typeof f === 'object' ? (f as Record<string, string>) : {};
  }
}

type Envelope<T> =
  | { success: true; data: T; meta: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; details: Record<string, unknown>; request_id: string } };

export type Result<T> = { data: T; meta: Record<string, unknown> };

async function readEnvelope<T>(res: Response): Promise<Envelope<T>> {
  try {
    return (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError('SERVER_ERROR', 'Unreadable server response.', {}, '-', res.status);
  }
}

function toApiError(body: Extract<Envelope<unknown>, { success: false }>, status: number): ApiError {
  return new ApiError(body.error.code, body.error.message, body.error.details ?? {}, body.error.request_id, status);
}

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  // FormData: để trình duyệt tự đặt Content-Type (multipart + boundary).
  const json = !(init?.body instanceof FormData);
  const res = await fetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
  const body = await readEnvelope<T>(res);
  if (!body.success) throw toApiError(body, res.status);
  return { data: body.data, meta: body.meta };
}

/** Tải file server sinh ra (xlsx…) về máy; lỗi vẫn theo chuẩn { code, message }. */
async function download(path: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await readEnvelope<unknown>(res);
    if (!body.success) throw toApiError(body, res.status);
    throw new ApiError('SERVER_ERROR', 'Download failed.', {}, '-', res.status);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => call<T>(path, init),
  post: <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) => call<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => call<T>(path, { method: 'DELETE' }),
  /** Gửi file (multipart/form-data). */
  upload: <T>(path: string, form: FormData) => call<T>(path, { method: 'POST', body: form }),
  download,
};

/** Ngày giờ theo giờ Việt Nam. Dữ liệu lưu timestamptz. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
}

/** Ngày (date hoặc timestamptz) dạng dd/mm/yyyy. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
    .format(new Date(iso.length <= 10 ? `${iso}T00:00:00+07:00` : iso));
}

export function formatRelativeTime(iso: string | null | undefined, language: 'en' | 'vi'): string {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return language === 'vi' ? 'vừa xong' : 'just now';
  if (minutes < 60) return language === 'vi' ? `${minutes} phút trước` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return language === 'vi' ? `${hours} giờ trước` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return language === 'vi' ? `${days} ngày trước` : `${days}d ago`;
  return formatTime(iso);
}

/** Cộng tháng vào ngày yyyy-mm-dd (xem trước "hạn mới"). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function todayVN(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
