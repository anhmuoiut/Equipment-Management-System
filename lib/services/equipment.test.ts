import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ getEquipment: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === 'equipment') return { select: () => ({ eq: () => ({ maybeSingle: mocks.getEquipment }) }) };
      throw new Error('Unexpected table ' + table);
    },
  }),
}));
import { updateEquipmentFromFields, createEquipmentFromFields } from './equipment';
import type { FieldDefinition } from '@/lib/validators/equipment';

function def(field_key: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: `def-${field_key}`, field_key, display_label: field_key, data_type: 'text', input_type: 'text',
    is_required: false, is_visible: true, display_order: 1, max_length: null, dropdown_options: null,
    help_text: null, placeholder: null, is_system: true,
    ...overrides,
  };
}

const defs: FieldDefinition[] = [
  def('serial_number'),
  def('types', { input_type: 'type_ref' }),
  def('status', { input_type: 'status_ref' }),
  def('calibration_required', { data_type: 'boolean', input_type: 'boolean' }),
  def('warranty_months', { is_system: false, input_type: 'number', data_type: 'number' }),
  def('vendor_name', { is_system: false, input_type: 'text' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: { id: 'eq-1' }, error: null });
});

describe('createEquipmentFromFields — system/custom split', () => {
  it('translates ref field_keys to their real column names and nests custom fields', async () => {
    await createEquipmentFromFields(
      { serial_number: 'SN-1', types: '11111111-1111-1111-1111-111111111111', warranty_months: '12' },
      defs, null, 'actor', 'req-1',
    );
    expect(mocks.rpc).toHaveBeenCalledWith('create_equipment_with_audit', expect.objectContaining({
      p_data: expect.objectContaining({
        serial_number: 'SN-1',
        type_id: '11111111-1111-1111-1111-111111111111',
        parent_id: null,
        custom_fields: { warranty_months: '12' },
      }),
    }));
    // A custom field_key never leaks through as a bare top-level column.
    const sent = mocks.rpc.mock.calls[0]![1].p_data;
    expect(sent).not.toHaveProperty('warranty_months');
  });
});

describe('updateEquipmentFromFields — custom_fields merge', () => {
  it('sends only real columns straight through when no custom field changed', async () => {
    await updateEquipmentFromFields('eq-1', 3, { status: '33333333-3333-3333-3333-333333333333' }, defs, 'actor', 'req-1');
    expect(mocks.getEquipment).not.toHaveBeenCalled(); // no need to read current row
    expect(mocks.rpc).toHaveBeenCalledWith('update_equipment_with_audit', expect.objectContaining({
      p_changes: { status_id: '33333333-3333-3333-3333-333333333333' },
    }));
  });

  it('merges a changed custom field onto the record\'s existing custom_fields rather than replacing the whole blob', async () => {
    mocks.getEquipment.mockResolvedValue({
      data: { id: 'eq-1', custom_fields: { warranty_months: '12', vendor_name: 'Acme' } },
      error: null,
    });
    await updateEquipmentFromFields('eq-1', 3, { vendor_name: 'NewCo' }, defs, 'actor', 'req-1');
    expect(mocks.rpc).toHaveBeenCalledWith('update_equipment_with_audit', expect.objectContaining({
      p_changes: { custom_fields: { warranty_months: '12', vendor_name: 'NewCo' } },
    }));
  });

  it('merges both a system field and a custom field change in the same call', async () => {
    mocks.getEquipment.mockResolvedValue({ data: { id: 'eq-1', custom_fields: { warranty_months: '12' } }, error: null });
    await updateEquipmentFromFields('eq-1', 3, { calibration_required: 'true', warranty_months: '24' }, defs, 'actor', 'req-1');
    expect(mocks.rpc).toHaveBeenCalledWith('update_equipment_with_audit', expect.objectContaining({
      p_changes: { calibration_required: 'true', custom_fields: { warranty_months: '24' } },
    }));
  });
});
