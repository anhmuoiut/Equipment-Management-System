import { withAuth, ok } from '@/lib/auth/withAuth';
import { listRecentErrors } from '@/lib/services/admin';

/** Tra cứu lỗi theo request_id — log Vercel Hobby chỉ giữ ~1 giờ (mục 47d).
 *  `?request_id=` searches the whole table, not just the latest `limit` rows. */
export const GET = withAuth(async (req, { requestId }) => {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? 50) || 50, 200);
  const search = sp.get('request_id')?.slice(0, 100) || undefined;
  return ok(await listRecentErrors(limit, search), requestId);
}, { role: ['admin'] });
