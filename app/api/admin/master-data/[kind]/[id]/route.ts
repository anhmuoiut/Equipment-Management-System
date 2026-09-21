import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { parseBody } from '@/lib/validators/equipment';
import { masterDataPatchSchema } from '@/lib/validators/field-config';
import { updateMasterData, type MasterDataKind } from '@/lib/services/master-data';

const KIND_MAP: Record<string, MasterDataKind> = {
  types: 'equipment_types', statuses: 'equipment_statuses', levels: 'equipment_levels', departments: 'departments',
};

function resolveKind(raw: string | undefined): MasterDataKind {
  const kind = KIND_MAP[raw ?? ''];
  if (!kind) throw new AppError('VALIDATION_ERROR', { kind: 'must be types, statuses, levels or departments' });
  return kind;
}

export const PUT = withAuth(
  async (req, { requestId, profile, params }) => {
    const kind = resolveKind(params.kind);
    const body = parseBody(masterDataPatchSchema, await req.json());
    if (kind !== 'equipment_statuses' && body.requires_remark !== undefined) {
      throw new AppError('VALIDATION_ERROR', { requires_remark: 'only applies to statuses' });
    }
    return ok(await updateMasterData(kind, params.id!, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
