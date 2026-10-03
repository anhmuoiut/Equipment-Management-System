import { withAuth, ok } from '@/lib/auth/withAuth';
import { loadLookups, toOptions } from '@/lib/services/core/lookups';

/** Mọi danh sách chọn (dữ liệu gốc Configuration) cho các form — mọi nhóm đọc được. */
export const GET = withAuth(async (_req, { requestId }) => ok(toOptions(await loadLookups()), requestId));
