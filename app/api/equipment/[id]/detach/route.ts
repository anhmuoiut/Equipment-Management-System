import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { detachEquipment } from '@/lib/services/equipment';
import { assertUuid, childrenMode, parseBody, readJson, z } from '@/lib/services/core/validate';

/** Tách khỏi cha — giữ vị trí hiện tại; `children`: con đi theo hay ở lại với cha cũ. */
export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const { children } = parseBody(z.object({ children: childrenMode }), await readJson(req));
  return ok(await detachEquipment(assertUuid(params.id), profile.id, children), requestId);
}, { role: EDITORS });
