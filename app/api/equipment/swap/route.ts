import { withAuth, ok } from '@/lib/auth/withAuth';
import { swapEquipment } from '@/lib/services/equipment';
import { swapSchema, parseBody } from '@/lib/validators/equipment';

/** Swap = 2 lần internal_move trong cùng transaction (mục 24). Dùng can_move. */
export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const b = parseBody(swapSchema, await req.json());
    const result = await swapEquipment(
      b.equipment_a_id, b.equipment_b_id, b.version_a, b.version_b, profile.id, requestId, b.note,
    );
    return ok(result, requestId);
  },
  { role: ['admin', 'user'], action: 'equipment.move' },
);
