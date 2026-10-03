import { withAuth, ok } from '@/lib/auth/withAuth';
import { EDITORS } from '@/lib/permissions';
import { listCandidates } from '@/lib/services/calibration';

/** Thiết bị có thể đưa vào Dashboard (chưa có, part number có chu kỳ). */
export const GET = withAuth(async (_req, { requestId }) => ok(await listCandidates(), requestId), { role: EDITORS });
