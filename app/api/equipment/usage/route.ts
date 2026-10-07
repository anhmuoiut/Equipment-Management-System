import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { setEquipmentUsage } from '@/lib/services/equipment';
import { optText, parseBody, readJson, reqId, z } from '@/lib/services/core/validate';

const MAX_IDS = 500;

/**
 * Check-out (usage = in_use) / Check-in (not_in_use): các thiết bị được chọn và toàn bộ con cháu của chúng
 * đổi cùng lúc, một giao dịch. Trả về `{ changed }` — số thiết bị đã đổi.
 */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const { ids, usage, note } = parseBody(z.object({
    ids: z.array(reqId).min(1).max(MAX_IDS),
    usage: z.enum(['in_use', 'not_in_use']),
    note: optText(500),
  }).strict(), await readJson(req));
  return ok({ changed: await setEquipmentUsage(ids, usage, note ?? null, profile.id) }, requestId);
}, { role: EDITORS });
