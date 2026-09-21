import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import { parseBody } from '@/lib/validators/equipment';
import { masterDataCreateSchema } from '@/lib/validators/field-config';
import { listMasterData, createMasterData, type MasterDataKind } from '@/lib/services/master-data';

const KIND_MAP: Record<string, MasterDataKind> = {
  types: 'equipment_types', statuses: 'equipment_statuses', levels: 'equipment_levels', departments: 'departments',
};

function resolveKind(raw: string | undefined): MasterDataKind {
  const kind = KIND_MAP[raw ?? ''];
  if (!kind) throw new AppError('VALIDATION_ERROR', { kind: 'must be types, statuses, levels or departments' });
  return kind;
}

export const GET = withAuth(
  async (_req, { requestId, params }) => ok(await listMasterData(resolveKind(params.kind), false), requestId),
  { role: ['admin', 'user'], action: 'master_data.manage' },
);

export const POST = withAuth(
  async (req, { requestId, profile, params }) => {
    const kind = resolveKind(params.kind);
    const body = parseBody(masterDataCreateSchema, await req.json());
    if (kind !== 'equipment_statuses' && body.requires_remark !== undefined) {
      throw new AppError('VALIDATION_ERROR', { requires_remark: 'only applies to statuses' });
    }
    return ok(await createMasterData(kind, body, profile.id, requestId), requestId);
  },
  { role: ['admin', 'user'], action: 'master_data.manage' },
);
