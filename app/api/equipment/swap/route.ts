import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { swapEquipment } from '@/lib/services/equipment';
import { childrenMode, parseBody, readJson, reqId, z } from '@/lib/services/core/validate';

/** Đổi chỗ hai thiết bị (cha + vị trí); `children`: con đi theo (mặc định) hay ở lại chỗ cũ. */
export const POST = withAuth(async (req, { requestId, profile }) => {
  const { a, b, children } = parseBody(z.object({ a: reqId, b: reqId, children: childrenMode }), await readJson(req));
  return ok(await swapEquipment(a, b, profile.id, children), requestId);
}, { role: EDITORS });
