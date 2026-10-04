import { withAuth, ok } from '@/lib/auth/withAuth';

/**
 * Endpoint KHÔNG xác thực duy nhất của hệ thống.
 * Không đụng bảng nghiệp vụ, không trả thông tin gì.
 * Dùng cho keepalive chống Supabase pause (.github/workflows/keepalive.yml).
 */
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (_req, { requestId }) => ok({ ok: true, ts: new Date().toISOString() }, requestId),
  { allowAnonymous: true },
);
