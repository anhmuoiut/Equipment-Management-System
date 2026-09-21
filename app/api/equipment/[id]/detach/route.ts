import { withAuth, ok } from '@/lib/auth/withAuth';
import { detachEquipment } from '@/lib/services/equipment';
import { versionOnlySchema, parseBody } from '@/lib/validators/equipment';

/** Giữ location cũ, KHÔNG cascade (mục 22). */
export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(versionOnlySchema, await req.json());
    return ok(await detachEquipment(params.id!, body.version, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'equipment.detach' },
);
