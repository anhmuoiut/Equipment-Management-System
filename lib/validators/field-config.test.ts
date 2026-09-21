import { describe, expect, it } from 'vitest';
import { validateFieldConfigPatch, validateCreateCustomField } from './field-config';
import { validateFields, type FieldDefinition } from './equipment';

const option = { value: 'level_1', label: 'Level 1', is_active: true };
const field: FieldDefinition = {
  id: 'def-level', field_key: 'level', display_label: 'Level', input_type: 'level_ref', data_type: 'text',
  dropdown_options: null, is_required: true, is_visible: true, display_order: 60,
  max_length: null, help_text: null, placeholder: null, is_system: true,
};

describe('admin field configuration — metadata patch', () => {
  it('accepts a presentation-only patch (label/required/visible/order/help/placeholder)', () => {
    const patch = validateFieldConfigPatch(field, {
      display_label: 'Production Stage', is_required: false, is_visible: true,
      display_order: 61, max_length: null, help_text: 'Pick the station group.', placeholder: null,
    });
    expect(patch.display_label).toBe('Production Stage');
    expect(patch.is_required).toBe(false);
  });
  it('rejects an empty patch', () => {
    expect(() => validateFieldConfigPatch(field, {})).toThrow();
  });
  it('rejects a patch that tries to change structural properties', () => {
    expect(() => validateFieldConfigPatch(field, { input_type: 'text' })).toThrow();
    expect(() => validateFieldConfigPatch(field, { field_key: 'new_column' })).toThrow();
    expect(() => validateFieldConfigPatch(field, { is_visible: 'yes' })).toThrow();
    expect(() => validateFieldConfigPatch(field, { display_label: ' ' })).toThrow();
  });
});

describe('admin field configuration — custom field creation', () => {
  it('creates a valid custom field definition', () => {
    const clean = validateCreateCustomField(['serial_number', 'level'], {
      field_key: 'warranty_months', display_label: 'Warranty (months)', input_type: 'number', is_required: false,
    });
    expect(clean).toMatchObject({ field_key: 'warranty_months', data_type: 'number', is_system: false });
  });
  it('rejects a field_key that already exists', () => {
    expect(() => validateCreateCustomField(['level'], { field_key: 'level', display_label: 'Level', input_type: 'text' })).toThrow();
  });
  it('rejects a reserved or invalid field_key', () => {
    expect(() => validateCreateCustomField([], { field_key: 'parent_id', display_label: 'x', input_type: 'text' })).toThrow();
    expect(() => validateCreateCustomField([], { field_key: 'Bad Key', display_label: 'x', input_type: 'text' })).toThrow();
  });
  it('never accepts one of the four *_ref input types for a custom field', () => {
    expect(() => validateCreateCustomField([], { field_key: 'foo', display_label: 'x', input_type: 'type_ref' })).toThrow();
  });
});

describe('validateFields — dropdown, ref and typed values', () => {
  const dropdownDef: FieldDefinition = {
    id: 'def-custom', field_key: 'custom_dd', display_label: 'Custom', input_type: 'dropdown', data_type: 'text',
    dropdown_options: [option], is_required: false, is_visible: true, display_order: 1,
    max_length: null, help_text: null, placeholder: null, is_system: false,
  };
  it('accepts an active dropdown option and rejects an inactive one', () => {
    expect(validateFields({ custom_dd: 'level_1' }, [dropdownDef], 'create')).toEqual({ custom_dd: 'level_1' });
    const inactive = { ...dropdownDef, dropdown_options: [{ ...option, is_active: false }] };
    expect(() => validateFields({ custom_dd: 'level_1' }, [inactive], 'create')).toThrow();
  });
  it('validates a *_ref field is a uuid and, when active refs are supplied, that it is active', () => {
    expect(() => validateFields({ level: 'not-a-uuid' }, [field], 'create')).toThrow();
    const uuid = '11111111-1111-1111-1111-111111111111';
    expect(validateFields({ level: uuid }, [field], 'create')).toEqual({ level: uuid });
    expect(() => validateFields({ level: uuid }, [field], 'create', { level: new Set(['22222222-2222-2222-2222-222222222222']) })).toThrow();
  });
  it('coerces a boolean field to a real boolean regardless of required/empty rules', () => {
    const boolDef: FieldDefinition = { ...dropdownDef, field_key: 'calibration_required', input_type: 'boolean', dropdown_options: null };
    expect(validateFields({ calibration_required: true }, [boolDef], 'create')).toEqual({ calibration_required: true });
    expect(validateFields({ calibration_required: 'false' }, [boolDef], 'create')).toEqual({ calibration_required: false });
  });
  it('validates number and date field types', () => {
    const numberDef = { ...dropdownDef, input_type: 'number' as const, dropdown_options: null };
    const dateDef = { ...dropdownDef, input_type: 'date' as const, dropdown_options: null };
    expect(() => validateFields({ custom_dd: 'Infinity' }, [numberDef], 'create')).toThrow();
    expect(() => validateFields({ custom_dd: '2026-02-30' }, [dateDef], 'create')).toThrow();
    expect(validateFields({ custom_dd: '2026-09-19' }, [dateDef], 'create')).toEqual({ custom_dd: '2026-09-19' });
  });
});
