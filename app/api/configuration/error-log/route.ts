import { withAuth, ok } from '@/lib/auth/withAuth';
import { ADMINS } from '@/lib/permissions';
import { listErrorLog } from '@/lib/services/configuration';

/** Configuration › HỆ THỐNG › Error log — chỉ xem. */
export const GET = withAuth(async (_req, { requestId }) => ok(await listErrorLog(), requestId), { role: ADMINS });
