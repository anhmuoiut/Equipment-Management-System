import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@/lib/client/api';
import { FIELD_LABELS, FIELD_HELP, fieldLabel, fieldHelp, optionLabelL } from './equipment';

function definition(field_key: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: `def-${field_key}`, field_key, display_label: 'Database label', help_text: 'Database help',
    data_type: 'text', input_type: 'dropdown', is_required: false,
    dropdown_options: [{ value: 'custom', label: 'Custom database option', is_active: true }],
    is_visible: true, display_order: 1, max_length: null, placeholder: null, is_system: false,
    ...overrides,
  };
}

describe('equipment language mappings', () => {
  it('provides matching label and help translation keys for every seeded system field', () => {
    expect(Object.keys(FIELD_LABELS).length).toBeGreaterThan(0);
    expect(Object.keys(FIELD_HELP).sort()).toEqual(Object.keys(FIELD_LABELS).sort());
    for (const key of Object.keys(FIELD_LABELS)) {
      const field = definition(key, { display_label: FIELD_LABELS[key]![0], help_text: FIELD_HELP[key]![0] });
      const enLabel = fieldLabel(field, 'en');
      const viLabel = fieldLabel(field, 'vi');
      expect(enLabel).not.toBe(viLabel);
      expect(enLabel).not.toMatch(/[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i);
    }
  });
  it('uses admin labels and help on system fields in both languages', () => {
    const field = definition('level', { display_label: 'Production stage', help_text: 'Choose the station group.' });
    for (const language of ['en', 'vi'] as const) {
      expect(fieldLabel(field, language)).toBe('Production stage');
      expect(fieldHelp(field, language)).toBe('Choose the station group.');
      expect(fieldHelp({ ...field, help_text: null }, language)).toBeNull();
    }
  });
  it('respects a custom dropdown field option regardless of language', () => {
    const field = definition('custom_field', { dropdown_options: [{ value: 'fixture', label: 'Custom jig', is_active: true }] });
    expect(optionLabelL(field, 'fixture', 'en')).toBe('Custom jig');
    expect(optionLabelL(field, 'fixture', 'vi')).toBe('Custom jig');
  });
  it('keeps a free-text value even when old dropdown options are retained', () => {
    const field = definition('custom_field', {
      input_type: 'text' as const, dropdown_options: [{ value: 'fixture', label: 'Custom jig', is_active: true }],
    });
    expect(optionLabelL(field, 'fixture', 'vi')).toBe('fixture');
  });
  it('preserves admin-defined fields and options as database text', () => {
    const custom = definition('custom_field');
    expect(fieldLabel(custom, 'en')).toBe('Database label');
    expect(fieldHelp(custom, 'vi')).toBe('Database help');
    expect(optionLabelL(custom, 'custom', 'vi')).toBe('Custom database option');
  });
});
