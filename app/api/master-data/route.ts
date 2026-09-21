import { withAuth, ok } from '@/lib/auth/withAuth';
import { listMasterData } from '@/lib/services/master-data';

/**
 * Read-only, every logged-in role — the equipment create/edit forms and
 * Masterlist filters need active Type/Status/Level options the same way
 * they already need /api/locations. Mutating this data is admin/
 * master_data.manage-gated under /api/admin/master-data/*.
 */
export const GET = withAuth(async (_req, { requestId }) => {
  const [types, statuses, levels, departments] = await Promise.all([
    listMasterData('equipment_types', true),
    listMasterData('equipment_statuses', true),
    listMasterData('equipment_levels', true),
    listMasterData('departments', true),
  ]);
  return ok({ types, statuses, levels, departments }, requestId);
});
