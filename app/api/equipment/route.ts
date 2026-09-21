import { withAuth, ok } from '@/lib/auth/withAuth';
import { AppError } from '@/lib/errors';
import {
  listEquipment, createEquipmentFromFields, getFieldDefinitions,
  getEditableFieldKeys, getActiveRefLookup, findDuplicates, type SortColumn,
} from '@/lib/services/equipment';
import { assertFields, isAdmin } from '@/lib/permissions';
import { createSchema, parseBody, validateFields } from '@/lib/validators/equipment';

const MAX_PAGE_SIZE = 200;

const SORT_COLUMNS: readonly SortColumn[] = [
  'status', 'jabil_id', 'part_number', 'serial_number', 'asset',
  'types', 'level', 'current_location_id', 'remark', 'parent',
];

export const GET = withAuth(async (req, { requestId }) => {
  const sp = new URL(req.url).searchParams;
  const pageSize = Math.min(Number(sp.get('pageSize') ?? 50) || 50, MAX_PAGE_SIZE);
  const page = Math.max(Number(sp.get('page') ?? 1) || 1, 1);

  const sortColumn = sp.get('sortBy');
  const rawDir = sp.get('sortDir');
  const sortDir: 'asc' | 'desc' | null = rawDir === 'asc' || rawDir === 'desc' ? rawDir : null;
  const sort = sortColumn && sortDir && (SORT_COLUMNS as string[]).includes(sortColumn)
    ? { column: sortColumn as SortColumn, direction: sortDir }
    : undefined;

  const { rows, total } = await listEquipment({
    search: sp.get('search') ?? undefined,
    page,
    pageSize,
    showArchived: sp.get('showArchived') === 'true',
    parentPickerFor: sp.get('parentPickerFor') ?? undefined,
    underRepair: sp.get('underRepair') === 'true',
    calibrationStatus: sp.get('calibrationStatus') ?? undefined,
    sort,
    filters: {
      status_id: sp.get('filters[status_id]') ?? undefined,
      type_id: sp.get('filters[type_id]') ?? undefined,
      level_id: sp.get('filters[level_id]') ?? undefined,
      current_location_id: sp.get('filters[current_location_id]') ?? undefined,
    },
  });

  return ok(rows, requestId, { page, pageSize, total });
});

export const POST = withAuth(
  async (req, { requestId, profile }) => {
    const body = parseBody(createSchema, await req.json());
    const defs = await getFieldDefinitions(true);
    const activeRefs = await getActiveRefLookup();

    const clean = validateFields(body.fields, defs, 'create', activeRefs);

    // parent_id không nằm trong field_definitions — nhận riêng.
    const parentId = body.fields.parent_id;
    if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
      throw new AppError('VALIDATION_ERROR', { parent_id: 'phải là uuid' });
    }

    const editable = isAdmin(profile) ? [] : await getEditableFieldKeys(profile.id);
    assertFields(profile, Object.keys(clean), isAdmin(profile) ? Object.keys(clean) : editable);

    const created = await createEquipmentFromFields(clean, defs, (parentId as string | null) ?? null, profile.id, requestId);

    // Cảnh báo duplicate, KHÔNG block.
    const dup = await findDuplicates(
      (created as { part_number: string | null }).part_number,
      (created as { serial_number: string }).serial_number,
    );

    return ok(created, requestId, {
      duplicate_warning: dup.length > 1 ? { code: 'DUPLICATE_WARNING', matches: dup } : null,
    });
  },
  { role: ['admin', 'user'], action: 'equipment.create' },
);
