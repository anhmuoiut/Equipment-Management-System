import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => { throw new Error('no database in unit tests'); } }));

/**
 * Sửa thiết bị cha trong form (docs/DATABASE_MODIFIED.md mục 2): đổi cha = Move,
 * bỏ trống = Detach; kiểm tra vòng lặp trước khi ghi. Database giả trong bộ nhớ.
 *
 *   ROOT (B3F1) ─ MID ─ LEAF        OTHER (B3F2)        TAGGED (B3F2, part number PN-T)
 */
const rows = [
  { id: 'root', parent_id: null, serial_number: 'ROOT', location_id: 'l1', level_id: 'lv1' },
  { id: 'mid', parent_id: 'root', serial_number: 'MID', location_id: 'l1' },
  { id: 'leaf', parent_id: 'mid', serial_number: 'LEAF', location_id: 'l1' },
  { id: 'other', parent_id: null, serial_number: 'OTHER', location_id: 'l2' },
  { id: 'tagged', parent_id: null, serial_number: 'TAGGED', location_id: 'l2', part_number_id: 'pn-t', type_id: 't-tester' },
  // Part number "chỉ In use khi có cha": một thiết bị đứng riêng, một đã gắn vào ROOT.
  { id: 'needy', parent_id: null, serial_number: 'NEEDY', location_id: 'l2', part_number_id: 'pn-n', type_id: 't-tester' },
  { id: 'mounted', parent_id: 'other', serial_number: 'MOUNTED', location_id: 'l2', part_number_id: 'pn-n', type_id: 't-tester' },
].map((r) => ({
  jabil_id: null, part_number_id: null, asset: null, type_id: null, usage: 'not_in_use', level_id: null, remark: null, tag_ids: [] as string[],
  created_at: '2026-10-01T00:00:00Z', created_by: null, updated_at: '2026-10-01T00:00:00Z', updated_by: null, ...r,
}));

const db = vi.hoisted(() => ({ appWrite: vi.fn(), rpc: vi.fn(), selectAll: vi.fn(), selectOne: vi.fn() }));
vi.mock('./core/db', () => db);

const named = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  [id, { id, display_name: name, sort_order: 0, is_active: true, ...extra }] as const;
vi.mock('./core/lookups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core/lookups')>()),
  loadLookups: async () => ({
    // PN-T → Tester; PN-H → a Type the admin hid later.
    part_numbers: new Map([
      named('pn-t', 'PN-T', { type_id: 't-tester', usage_needs_parent: false }),
      named('pn-h', 'PN-H', { type_id: 't-hidden', usage_needs_parent: false }),
      named('pn-n', 'PN-N', { type_id: 't-tester', usage_needs_parent: true }),
    ]),
    types: new Map([named('t-tester', 'Tester'), named('t-base', 'Base'), named('t-hidden', 'Old', { is_active: false })]),
    levels: new Map([named('lv1', 'ICT'), named('lv2', 'FT')]), departments: new Map(), calibration_vendors: new Map(),
    tags: new Map([
      ['tg1', { id: 'tg1', display_name: 'Repair', sort_order: 1, color: 'yellow' }],
      ['tg2', { id: 'tg2', display_name: 'Spare', sort_order: 2, color: 'gray' }],
    ]),
    users: new Map(), locations: new Map([named('l1', 'B3F1'), named('l2', 'B3F2')]),
  }),
}));

import { createEquipment, setEquipmentUsage, updateEquipment } from './equipment';

beforeEach(() => {
  vi.clearAllMocks();
  db.selectOne.mockImplementation(async (_table: string, id: string) => rows.find((r) => r.id === id) ?? null);
  db.selectAll.mockImplementation(async () => rows);
});

/** Các lệnh ghi theo thứ tự: tên RPC (hoặc app_write) + tham số chính. */
const writes = () => [
  ...db.appWrite.mock.calls.map((c, i) => ({ order: db.appWrite.mock.invocationCallOrder[i]!, call: ['app_write', c[3]] })),
  ...db.rpc.mock.calls.map((c, i) => ({ order: db.rpc.mock.invocationCallOrder[i]!, call: [c[0], c[1]] })),
].sort((a, b) => a.order - b.order).map((w) => w.call);

describe('updateEquipment — thiết bị cha sửa được trong form', () => {
  it('a new parent moves the equipment (location follows the parent; a sent location is ignored)', async () => {
    await updateEquipment('mid', { parent_id: 'other', location_id: 'l1' }, 'u1');
    expect(writes()).toEqual([['equipment_move', { p_id: 'mid', p_parent_id: 'other', p_actor: 'u1', p_children: 'follow' }]]);
  });

  it('clearing the parent detaches, then applies the new location', async () => {
    await updateEquipment('mid', { parent_id: null, location_id: 'l2', jabil_id: 'J9' }, 'u1');
    expect(writes()).toEqual([
      ['app_write', { jabil_id: 'J9' }],
      ['equipment_detach', { p_id: 'mid', p_actor: 'u1', p_children: 'follow' }],
      ['equipment_change_location', { p_id: 'mid', p_location_id: 'l2', p_actor: 'u1', p_children: 'follow' }],
    ]);
  });

  it('passes "children stay" from the form to the database, never as a column', async () => {
    await updateEquipment('mid', { parent_id: 'other', children_mode: 'stay', jabil_id: 'J9' }, 'u1');
    expect(writes()).toEqual([
      ['app_write', { jabil_id: 'J9' }],
      ['equipment_move', { p_id: 'mid', p_parent_id: 'other', p_actor: 'u1', p_children: 'stay' }],
    ]);
  });

  it('an unchanged parent writes only the other fields', async () => {
    await updateEquipment('mid', { parent_id: 'root', jabil_id: 'J9' }, 'u1');
    expect(writes()).toEqual([['app_write', { jabil_id: 'J9' }]]);
  });

  it('refuses its own descendant (or itself) as parent, before writing anything', async () => {
    await expect(updateEquipment('root', { parent_id: 'leaf', jabil_id: 'J9' }, 'u1')).rejects.toMatchObject({ code: 'PARENT_CYCLE_DETECTED' });
    await expect(updateEquipment('root', { parent_id: 'root' }, 'u1')).rejects.toMatchObject({ code: 'PARENT_CYCLE_DETECTED' });
    await expect(updateEquipment('root', { parent_id: 'gone' }, 'u1')).rejects.toMatchObject({ code: 'PARENT_NOT_FOUND' });
    expect(writes()).toEqual([]);
  });

  it('a child keeping its parent cannot change location on its own', async () => {
    await expect(updateEquipment('leaf', { location_id: 'l2' }, 'u1')).rejects.toMatchObject({ code: 'LOCATION_INHERITED_READ_ONLY' });
    expect(writes()).toEqual([]);
  });
});

describe('Type follows the part number (Configuration › Part Number)', () => {
  it('picking a part number writes its Type — a sent Type is ignored', async () => {
    await updateEquipment('other', { part_number_id: 'pn-t', type_id: 't-base' }, 'u1');
    expect(writes()).toEqual([['app_write', { part_number_id: 'pn-t', type_id: 't-tester' }]]);
  });

  it('equipment that has a part number cannot get another Type', async () => {
    await updateEquipment('tagged', { type_id: 't-base' }, 'u1');
    expect(writes()).toEqual([['app_write', { type_id: 't-tester' }]]);
  });

  it('the Type of the part number is accepted even if the admin hid that Type later', async () => {
    await updateEquipment('other', { part_number_id: 'pn-h' }, 'u1');
    expect(writes()).toEqual([['app_write', { part_number_id: 'pn-h', type_id: 't-hidden' }]]);
  });

  it('Part Number is required when adding equipment — nothing is written without it', async () => {
    await expect(createEquipment({ serial_number: 'NEW', location_id: 'l1' }, 'u1'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { fields: { part_number_id: 'required' } } });
    expect(writes()).toEqual([]);
  });

  it('an edit that touches neither part number nor Type writes no Type', async () => {
    await updateEquipment('tagged', { jabil_id: 'J9' }, 'u1');
    expect(writes()).toEqual([['app_write', { jabil_id: 'J9' }]]);
  });

  it('adding equipment with a part number saves the Type of that part number', async () => {
    db.appWrite.mockResolvedValueOnce({ id: 'tagged' });
    await createEquipment({ serial_number: 'NEW', part_number_id: 'pn-t', type_id: 't-base', location_id: 'l1' }, 'u1');
    expect(writes()).toEqual([['app_write', { serial_number: 'NEW', part_number_id: 'pn-t', type_id: 't-tester', location_id: 'l1' }]]);
  });
});

describe('Level follows the parent equipment (like location)', () => {
  it('a child ignores a Level sent on its own', async () => {
    await updateEquipment('mid', { level_id: 'lv2' }, 'u1');
    expect(writes()).toEqual([]);
  });

  it('equipment without a parent changes its Level (the database carries it down the tree)', async () => {
    await updateEquipment('root', { level_id: 'lv2' }, 'u1');
    expect(writes()).toEqual([['app_write', { level_id: 'lv2' }]]);
  });

  it('a new parent: Level follows that parent, a sent Level is ignored', async () => {
    await updateEquipment('mid', { parent_id: 'other', level_id: 'lv2' }, 'u1');
    expect(writes()).toEqual([['equipment_move', { p_id: 'mid', p_parent_id: 'other', p_actor: 'u1', p_children: 'follow' }]]);
  });

  it('detaching and picking a Level: detach first, then write the Level', async () => {
    await updateEquipment('mid', { parent_id: null, level_id: 'lv2' }, 'u1');
    expect(writes()).toEqual([
      ['equipment_detach', { p_id: 'mid', p_actor: 'u1', p_children: 'follow' }],
      ['app_write', { level_id: 'lv2' }],
    ]);
  });

  it('adding a child copies the location and Level of the parent', async () => {
    db.appWrite.mockResolvedValueOnce({ id: 'mid' });
    await createEquipment({ serial_number: 'KID', part_number_id: 'pn-t', parent_id: 'root', level_id: 'lv2', location_id: 'l2' }, 'u1');
    expect(writes()).toEqual([['app_write', {
      serial_number: 'KID', part_number_id: 'pn-t', type_id: 't-tester', location_id: 'l1', level_id: 'lv1', parent_id: 'root',
    }]]);
  });
});

describe('Check-out / Check-in (usage)', () => {
  // ROOT ─ MID ─ LEAF (all Not in use); OTHER; TAGGED.
  it('sends the chosen equipment to the database, which carries the whole tree', async () => {
    db.rpc.mockResolvedValueOnce(3);
    const changed = await setEquipmentUsage(['root', 'root', 'other'], 'in_use', ' Line 3 ', 'u1');
    expect(changed).toBe(3);
    expect(db.rpc).toHaveBeenCalledWith('equipment_set_usage', { p_ids: ['root', 'other'], p_usage: 'in_use', p_actor: 'u1', p_note: ' Line 3 ' });
  });

  it('nothing to change (everything already Not in use) → USAGE_NO_CHANGE, no database call', async () => {
    await expect(setEquipmentUsage(['root'], 'not_in_use', null, 'u1')).rejects.toMatchObject({ code: 'USAGE_NO_CHANGE' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('a branch with one device still in use can be checked in; unknown ids are refused', async () => {
    db.selectAll.mockImplementation(async () => rows.map((r) => (r.id === 'leaf' ? { ...r, usage: 'in_use' } : r)));
    db.rpc.mockResolvedValueOnce(1);
    await setEquipmentUsage(['root'], 'not_in_use', null, 'u1');
    expect(db.rpc).toHaveBeenCalledTimes(1);
    await expect(setEquipmentUsage(['nope'], 'in_use', null, 'u1')).rejects.toMatchObject({ code: 'EQUIPMENT_NOT_FOUND' });
  });
});

describe('Usage needs a parent (part number rule)', () => {
  it('a standalone device of such a part number cannot be checked out — nothing is sent', async () => {
    await expect(setEquipmentUsage(['needy'], 'in_use', null, 'u1')).rejects.toMatchObject({
      code: 'USAGE_NEEDS_PARENT', details: { serials: ['NEEDY'] },
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('the same device can be checked out once it has a parent; Check-in is always allowed', async () => {
    db.rpc.mockResolvedValue(1);
    await setEquipmentUsage(['mounted'], 'in_use', null, 'u1');
    await setEquipmentUsage(['needy'], 'not_in_use', null, 'u1').catch(() => undefined); // already Not in use → no change
    expect(db.rpc).toHaveBeenCalledWith('equipment_set_usage', expect.objectContaining({ p_ids: ['mounted'], p_usage: 'in_use' }));
  });
});

describe('Tags in Remark (Configuration › Tag)', () => {
  it('known tags are saved as an array of ids, in the order picked', async () => {
    await updateEquipment('other', { tag_ids: ['tg2', 'tg1'] }, 'u1');
    expect(writes()).toEqual([['app_write', { tag_ids: ['tg2', 'tg1'] }]]);
  });

  it('an unknown tag id is refused on the tags field, nothing written', async () => {
    await expect(updateEquipment('other', { tag_ids: ['tg1', 'nope'] }, 'u1'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { fields: { tag_ids: 'not_found' } } });
    expect(writes()).toEqual([]);
  });

  it('clearing every tag is allowed (empty list)', async () => {
    await updateEquipment('other', { tag_ids: [] }, 'u1');
    expect(writes()).toEqual([['app_write', { tag_ids: [] }]]);
  });

  it('a row shows its tags sorted by the configured order, with colours', async () => {
    db.selectOne.mockImplementation(async (_t: string, id: string) => (id === 'other' ? { ...rows.find((r) => r.id === 'other')!, tag_ids: ['tg2', 'tg1'] } : null));
    db.selectAll.mockImplementation(async () => rows);
    const { row } = await updateEquipment('other', {}, 'u1');
    expect(row.tags).toEqual([{ id: 'tg1', display_name: 'Repair', color: 'yellow' }, { id: 'tg2', display_name: 'Spare', color: 'gray' }]);
  });
});
