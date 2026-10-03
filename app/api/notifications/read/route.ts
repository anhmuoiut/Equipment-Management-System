import { withAuth, ok } from '@/lib/auth/withAuth';
import { markNotificationsRead } from '@/lib/services/notifications';
import { parseBody, readJson, z } from '@/lib/services/core/validate';

/** Đánh dấu đã đọc — `ids` rỗng = tất cả. Chỉ thông báo của chính mình. */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const { ids } = parseBody(z.object({ ids: z.array(z.string().uuid()).max(200).default([]) }), await readJson(req));
  await markNotificationsRead(profile.id, ids ?? []);
  return ok({ marked: true }, requestId);
});
