import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { moveEquipment } from '@/lib/services/equipment';
import { assertUuid, childrenMode, parseBody, readJson, reqId, z } from '@/lib/services/core/validate';

/** Đổi cha / gắn vào cha — vị trí theo cha mới; `children`: con đi theo hay ở lại với cha cũ. */
export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const { parent_id, children } = parseBody(z.object({ parent_id: reqId, children: childrenMode }), await readJson(req));
  return ok(await moveEquipment(assertUuid(params.id), parent_id, profile.id, children), requestId);
}, { role: EDITORS });
