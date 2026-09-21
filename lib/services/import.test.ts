import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldDefinition } from '@/lib/validators/equipment';
import type { UserProfile } from '@/lib/permissions';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ definitions: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/services/equipment', () => ({
  getFieldDefinitions: mocks.definitions, createEquipmentFromFields: mocks.create,
  getEditableFieldKeys: async () => [], findDuplicates: async () => [],
}));

// validateFields checks *_ref values look like real uuids, so these mocks
// must be uuid-shaped even though the tests never inspect the ids directly.
const LEVELS = [{ id: '11111111-1111-1111-1111-111111111111', code: 'unified', display_name: 'Unified' }];
const TYPES = [{ id: '22222222-2222-2222-2222-222222222222', code: 'fixture', display_name: 'Fixture' }];
const STATUSES = [{ id: '33333333-3333-3333-3333-333333333333', code: 'active', display_name: 'Active' }];
const LOCATIONS = [{ id: '44444444-4444-4444-4444-444444444444', code: 'B3F5' }];

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'locations') return { select: () => ({ eq: async () => ({ data: LOCATIONS, error: null }) }) };
      if (table === 'equipment_levels') return { select: () => ({ eq: async () => ({ data: LEVELS, error: null }) }) };
      if (table === 'equipment_types') return { select: () => ({ eq: async () => ({ data: TYPES, error: null }) }) };
      if (table === 'equipment_statuses') return { select: () => ({ eq: async () => ({ data: STATUSES, error: null }) }) };
      throw new Error('Unexpected table ' + table);
    },
  }),
}));
import { importEquipment } from './import';
const profile = { id: 'admin', role: 'admin' } as UserProfile;
const header = ['Serial Number', 'Part Number', 'Status', 'Type', 'Level', 'Calibration Required', 'Location'];
function definition(field_key: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: `def-${field_key}`, field_key, display_label: field_key, data_type: 'text', input_type: 'text',
    is_required: field_key === 'serial_number',
    is_visible: true, display_order: 1, max_length: null, dropdown_options: null, help_text: null, placeholder: null,
    is_system: true,
    ...overrides,
  };
}
let defs: FieldDefinition[];
beforeEach(() => {
  vi.clearAllMocks();
  defs = [
    definition('serial_number'), definition('part_number'), definition('jabil_id'), definition('asset'),
    definition('types', { input_type: 'type_ref' }), definition('level', { input_type: 'level_ref' }),
    definition('status', { input_type: 'status_ref' }),
    definition('calibration_required', { data_type: 'boolean', input_type: 'boolean' }),
    definition('remark', { input_type: 'textarea' }),
    definition('current_location_id', { input_type: 'location_ref' }),
  ];
  mocks.definitions.mockImplementation(async () => defs);
  mocks.create.mockResolvedValue({ id: 'new-equipment', serial_number: 'SERIAL-1' });
});
describe('bulk import resolves master-data references', () => {
  it('resolves Status/Type/Level display names to their master-data ids (dry run)', async () => {
    const result = await importEquipment(
      [['SERIAL-1', 'PART-1', 'Active', 'Fixture', 'Unified', 'true', 'B3F5']], header, profile, 'request', false,
    );
    expect(result.committed).toBe(false); // dry run never writes
    expect(result.invalid).toBe(0);
    expect(result.valid).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('resolves by code as well as display name, case-insensitively', async () => {
    const result = await importEquipment(
      [['SERIAL-1', 'PART-1', 'ACTIVE', 'fixture', 'unified', 'false', 'b3f5']], header, profile, 'request', false,
    );
    expect(result.invalid).toBe(0);
  });
  it('rejects a Status/Type/Level value that does not match any active master-data row', async () => {
    const result = await importEquipment(
      [['SERIAL-1', 'PART-1', 'Nonexistent', 'Fixture', 'Unified', 'false', 'B3F5']], header, profile, 'request', false,
    );
    expect(result.invalid).toBe(1);
    expect(result.rows[0]?.errors?.[0]).toMatch(/not a recognized active value/);
  });
  it('rejects a row missing Serial Number before any writes', async () => {
    const result = await importEquipment(
      [['', 'PART-1', 'Active', 'Fixture', 'Unified', 'false', 'B3F5']], header, profile, 'request', true,
    );
    expect(result.invalid).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('commits only once every row validates clean', async () => {
    const result = await importEquipment(
      [['SERIAL-1', 'PART-1', 'Active', 'Fixture', 'Unified', 'true', 'B3F5']], header, profile, 'request', true,
    );
    expect(result.committed).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
