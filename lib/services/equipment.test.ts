import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => { throw new Error('no database in unit tests'); } }));

/**
 * Sửa thiết bị cha trong form (docs/DATABASE_MODIFIED.md mục 2): đổi cha = Move,
 * bỏ trống = Detach; kiểm tra vòng lặp trước khi ghi. Database giả trong bộ nhớ.
 *
 *   ROOT (B3F1) ─ MID ─ LEAF        OTHER (B3F2)
 */
const rows = [
  { id: 'root', parent_id: null, serial_number: 'ROOT', location_id: 'l1' },
  { id: 'mid', parent_id: 'root', serial_number: 'MID', location_id: 'l1' },
  { id: 'leaf', parent_id: 'mid', serial_number: 'LEAF', location_id: 'l1' },
  { id: 'other', parent_id: null, serial_number: 'OTHER', location_id: 'l2' },
].map((r) => ({
  ...r, jabil_id: null, part_number_id: null, asset: null, type_id: null, status_id: null, level_id: null, remark: null,
  created_at: '2026-10-01T00:00:00Z', created_by: null, updated_at: '2026-10-01T00:00:00Z', updated_by: null,
}));

const db = vi.hoisted(() => ({ appWrite: vi.fn(), rpc: vi.fn(), selectAll: vi.fn(), selectOne: vi.fn() }));
vi.mock('./core/db', () => db);

const named = (id: string, name: string) => [id, { id, display_name: name, sort_order: 0, is_active: true }] as const;
vi.mock('./core/lookups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core/lookups')>()),
  loadLookups: async () => ({
    part_numbers: new Map(), types: new Map(), levels: new Map(), departments: new Map(), calibration_vendors: new Map(),
    statuses: new Map(), users: new Map(), locations: new Map([named('l1', 'B3F1'), named('l2', 'B3F2')]),
  }),
}));

import { updateEquipment } from './equipment';

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
