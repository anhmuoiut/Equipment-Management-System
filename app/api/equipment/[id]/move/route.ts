import { withAuth, ok } from '@/lib/auth/withAuth';
import { moveEquipment } from '@/lib/services/equipment';
import { moveSchema, parseBody } from '@/lib/validators/equipment';

export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const body = parseBody(moveSchema, await req.json());
    const result = await moveEquipment(
      params.id!, body.new_parent_id, body.version, profile.id, requestId,
    );
    return ok(result, requestId);
  },
  { role: ['admin', 'user'], action: 'equipment.move' },
);
