import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { changeLocation } from '@/lib/services/equipment';
import { assertUuid, childrenMode, parseBody, readJson, reqId, z } from '@/lib/services/core/validate';

/** Đổi vị trí (thiết bị không có cha); `children`: con đi theo hay đứng riêng ở vị trí cũ. */
export const POST = withAuth(async (req, { requestId, profile, params }) => {
  const { location_id, children } = parseBody(z.object({ location_id: reqId, children: childrenMode }), await readJson(req));
  return ok(await changeLocation(assertUuid(params.id), location_id, profile.id, children), requestId);
}, { role: EDITORS });
