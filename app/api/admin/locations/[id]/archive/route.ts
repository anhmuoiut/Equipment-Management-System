import { withAuth, ok } from '@/lib/auth/withAuth';
import { updateLocation } from '@/lib/services/admin';

/** Location đang dùng KHÔNG hard-delete, chỉ is_active = false (mục 10). */
export const POST = withAuth(
  async (_req, { requestId, profile, params }) =>
    ok(await updateLocation(params.id!, { is_active: false }, profile.id, requestId), requestId),
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
