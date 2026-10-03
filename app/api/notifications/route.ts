import { withAuth, ok } from '@/lib/auth/withAuth';
import { listNotifications } from '@/lib/services/notifications';

/** Thông báo của chính người đang đăng nhập (mọi nhóm). */
export const GET = withAuth(async (_req, { requestId, profile }) =>
  ok(await listNotifications(profile.id), requestId),
);
