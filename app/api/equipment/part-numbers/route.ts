import { withAuth, ok } from '@/lib/auth/withAuth';
import { equipmentPartNumberIds } from '@/lib/services/equipment';

/** Id các part number đang có thiết bị dùng — ô chọn PN ở Configuration › Hiệu chuẩn › Setup. */
export const GET = withAuth(async (_req, { requestId }) => ok(await equipmentPartNumberIds(), requestId));
