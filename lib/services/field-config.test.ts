import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
  if (table === 'field_definitions') return {
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
    update: (patch: unknown) => { mocks.write(patch); return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'field-id', ...(patch as object) }, error: null }) }) }) }; },
  };
  if (table === 'audit_log') return { insert: mocks.audit };
  throw new Error('Unexpected database table ' + table);
} }) }));
import { updateFieldDefinition } from './admin';
const existing = { id: 'field-id', field_key: 'level', input_type: 'level_ref', is_system: true, display_label: 'Level' };
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: existing, error: null }); mocks.audit.mockResolvedValue({ error: null }); });
describe('field configuration persistence — metadata patch only', () => {
  it('writes a presentation metadata patch and records the audit', async () => {
    const patch = { display_label: 'Production Level', is_required: true, is_visible: true, display_order: 61, max_length: null, help_text: 'x', placeholder: null };
    const result = await updateFieldDefinition('level', patch, 'admin', 'request');
    expect(mocks.write).toHaveBeenCalledWith({ ...patch, updated_by: 'admin' });
    expect(result.display_label).toBe('Production Level');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FIELD_CONFIG_UPDATE', entity_id: 'field-id' }));
  });
  it('rejects an attempt to change structural properties through the metadata patch', async () => {
    await expect(updateFieldDefinition('level', { input_type: 'text' }, 'admin', 'request')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('does not create a database column for an unknown field', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    await expect(updateFieldDefinition('new_field', { display_label: 'New' }, 'admin', 'request')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('fails before writing if the existing configuration cannot be read', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { code: '08006' } });
    await expect(updateFieldDefinition('level', { display_label: 'x' }, 'admin', 'request')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
