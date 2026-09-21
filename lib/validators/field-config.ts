import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { parseBody, REF_INPUT_TYPES, type FieldDefinition } from './equipment';

/** Metadata every field (system or custom) can have edited. input_type and
 *  data_type are excluded here — a system field's is fixed at creation and
 *  never changes shape; a custom field's are set once at creation time
 *  (see createCustomFieldSchema) and also don't change afterward, since
 *  repointing a field already holding data at a different shape is exactly
 *  the kind of structural change field_options/custom_fields can't safely
 *  migrate automatically. */
const patchSchema = z.object({
  display_label: z.string().trim().min(1),
  is_required: z.boolean(),
  is_visible: z.boolean(),
  display_order: z.number().int(),
  max_length: z.number().int().positive().nullable(),
  help_text: z.string().trim().nullable(),
  placeholder: z.string().trim().nullable(),
}).partial().strict();

/** Configuration changes metadata; it never adds equipment columns or rewrites records. */
export function validateFieldConfigPatch(before: FieldDefinition, input: unknown) {
  const clean = parseBody(patchSchema, input);
  const fail = (field: string, message: string): never => {
    throw new AppError('VALIDATION_ERROR', { fields: { [field]: message } });
  };
  if (!Object.keys(clean).length) fail('field', 'No settings were supplied.');
  return clean;
}

const createCustomFieldSchema = z.object({
  field_key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,63}$/,
    'Use 1-64 lowercase letters, numbers or underscores, starting with a letter.'),
  display_label: z.string().trim().min(1).max(200),
  input_type: z.enum(['text', 'textarea', 'number', 'date', 'boolean', 'dropdown']),
  is_required: z.boolean().default(false),
  is_visible: z.boolean().default(true),
  display_order: z.number().int().default(0),
  max_length: z.number().int().positive().nullable().optional(),
  help_text: z.string().trim().nullable().optional(),
  placeholder: z.string().trim().nullable().optional(),
}).strict();

const RESERVED_KEYS = new Set(['id', 'parent_id', 'version', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'archived_by', 'custom_fields']);

/** A brand new admin-created field — always is_system = false, and never
 *  one of the four *_ref input types (those exist only for the fixed
 *  Type/Status/Level/Location system fields, which each have their own
 *  master-data table; a custom field has none). */
export function validateCreateCustomField(existingKeys: readonly string[], input: unknown) {
  const clean = parseBody(createCustomFieldSchema, input);
  if (RESERVED_KEYS.has(clean.field_key) || existingKeys.includes(clean.field_key)) {
    throw new AppError('VALIDATION_ERROR', { fields: { field_key: 'This key is already in use.' } });
  }
  return {
    ...clean,
    data_type: (clean.input_type === 'number' ? 'number'
      : clean.input_type === 'date' ? 'date'
      : clean.input_type === 'boolean' ? 'boolean' : 'text') as 'text' | 'number' | 'date' | 'boolean',
    max_length: clean.max_length ?? null,
    help_text: clean.help_text ?? null,
    placeholder: clean.placeholder ?? null,
    is_system: false,
  };
}

export const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
}).strict();

export const fieldOptionPatchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
}).strict();

/** Used by Admin → Master data (Types/Statuses/Levels) and by Locations. */
export const masterDataCreateSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Za-z][A-Za-z0-9_]*$/,
    'Use 1-50 letters, numbers or underscores, starting with a letter.'),
  display_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullish(),
  display_order: z.number().int().optional(),
  requires_remark: z.boolean().optional(),
}).strict();

export const masterDataPatchSchema = z.object({
  display_name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullish(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  requires_remark: z.boolean().optional(),
}).strict();

export { REF_INPUT_TYPES };
