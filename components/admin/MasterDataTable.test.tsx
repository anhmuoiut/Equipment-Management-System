// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MasterDataTable } from './MasterDataTable';
import { api, ApiError } from '@/lib/client/api';
import { masterDataCreateSchema } from '@/lib/validators/field-config';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/lib/client/api', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/client/api')>();
  return { ...original, api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});
const endpoint = '/api/admin/master-data/departments';
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: [], meta: {} });
});
async function fillDepartment() {
  render(<MasterDataTable title="Department" hint="" endpoint={endpoint} showRequiresRemark={false} canManage />);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'adminMasterData.newEntry' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'common.code' }), { target: { value: 'TE' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'common.name' }), { target: { value: 'Test Engineering' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'adminFields.sortOrder' }), { target: { value: '10' } });
}
it('saves the uppercase Department code using a payload accepted by the API schema', async () => {
  vi.mocked(api.post).mockImplementation(async (_path, payload) => ({
    data: { id: 'department-1', ...masterDataCreateSchema.parse(payload) }, meta: {},
  }));
  await fillDepartment();
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('adminMasterData.added');
  expect(api.post).toHaveBeenCalledWith(endpoint, {
    code: 'TE', display_name: 'Test Engineering', description: null, display_order: 10,
  });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'common.code' })).toBeNull());
});
it.each([
  { fields: { code: 'This code is already in use.' } },
  { issues: [{ path: ['code'], message: 'This code is already in use.' }] },
])('shows the validation reason and keeps the unsaved values', async details => {
  vi.mocked(api.post).mockRejectedValue(new ApiError('VALIDATION_ERROR', 'Invalid data', details, 'request-1', 400));
  await fillDepartment();
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('common.code: This code is already in use.');
  expect((screen.getByRole('textbox', { name: 'common.code' }) as HTMLInputElement).value).toBe('TE');
  expect((screen.getByRole('textbox', { name: 'common.name' }) as HTMLInputElement).value).toBe('Test Engineering');
});
