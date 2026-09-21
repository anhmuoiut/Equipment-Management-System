import { withAuth, ok } from '@/lib/auth/withAuth';
import { archiveEquipment } from '@/lib/services/equipment';
import { versionOnlySchema, parseBody } from '@/lib/validators/equipment';

/** Block nếu còn child CHƯA archive (mục 25). Child đã archive không tính. */
export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(versionOnlySchema, await req.json());
    return ok(await archiveEquipment(params.id!, body.version, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'equipment.archive' },
);
