// @vitest-environment jsdom
/**
 * Smoke test từng module với dữ liệu mẫu: Masterlist hiện dòng, mở Detail
 * Panel, chuyển tab, vào chế độ Sửa — bắt lỗi khi chạy (sai tên trường, crash)
 * mà không cần database.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error('notFound'); },
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
class IO { observe() {} disconnect() {} }
vi.stubGlobal('IntersectionObserver', IO);

const audit = {
  created_at: '2026-10-01T01:00:00Z', created_by: 'u1', created_by_name: 'Admin',
  updated_at: '2026-10-01T02:00:00Z', updated_by: 'u1', updated_by_name: 'Admin',
};
const opt = (id: string, name: string) => ({ id, display_name: name, sort_order: 0, is_active: true });
const options = {
  part_numbers: [{ ...opt('pn1', 'P12316'), type_id: 't1', usage_needs_parent: false }], locations: [opt('l1', 'B3F1'), opt('l2', 'B3F2')], types: [opt('t1', 'Tester')],
  levels: [opt('lv1', 'EOL')], departments: [opt('d1', 'TE')], calibration_vendors: [opt('v1', 'Internal')],
  tags: [
    { id: 'tg1', display_name: 'Repair', sort_order: 1, color: 'yellow' },
    { id: 'tg2', display_name: 'Spare', sort_order: 2, color: 'gray' },
  ],
};
const repairTag = { id: 'tg1', display_name: 'Repair', color: 'yellow' };
const equipment = [
  { id: 'e1', jabil_id: 'J1', part_number_id: 'pn1', part_number: 'P12316', serial_number: 'SN-ROOT', asset: 'A1', type_id: 't1', type: 'Tester',
    level_id: 'lv1', level: 'EOL', location_id: 'l1', location: 'B3F1', remark: null, tag_ids: ['tg1'], tags: [repairTag],
    parent_id: null, parent_serial: null, has_children: true, usage: 'not_in_use', ...audit },
  { id: 'e2', jabil_id: null, part_number_id: null, part_number: null, serial_number: 'SN-CHILD', asset: null, type_id: null, type: null,
    level_id: null, level: null, location_id: 'l1', location: 'B3F1', remark: 'x', tag_ids: [], tags: [],
    parent_id: 'e1', parent_serial: 'SN-ROOT', has_children: false, usage: 'in_use', ...audit },
  { id: 'e3', jabil_id: null, part_number_id: null, part_number: null, serial_number: 'SN-OTHER', asset: null, type_id: 't1', type: 'Tester',
    level_id: null, level: null, location_id: 'l2', location: 'B3F2', remark: null, tag_ids: [], tags: [],
    parent_id: null, parent_serial: null, has_children: false, usage: 'not_in_use', ...audit },
];
const calibration = [{
  id: 'c1', equipment_id: 'e1', serial_number: 'SN-ROOT', part_number: 'P12316', type: 'Tester', location: 'B3F1',
  status: 'overdue', vendor_id: 'v1', vendor: 'Internal', calibration_date: '2025-10-01', due_date: '2026-09-30',
  interval_months: 12, warning_days: 30, due_state: 'overdue', remark: null, tag_ids: [], tags: [], ...audit,
}];
const golden = [{
  id: 'g1', part_number: 'PCBA-1', serial_number: 'GS-1', utd_part_number: 'UTD-1', location_id: 'l2', location: 'B3F2',
  origin: 'Customer', purpose: 'ICT', remark: null, tag_ids: [], tags: [], ...audit,
}];
const users = [{
  id: 'u2', username: 'bob', full_name: 'Bob', email: null, employee_id: '100', department_id: 'd1', department: 'TE',
  role: 'readonly', account_status: 'pending', approved_by: null, approved_by_name: null, approved_at: null,
  auth_provider: 'local', must_change_password: false, ...audit,
}];
const config = {
  'part-numbers': [{ id: 'pn1', display_name: 'P12316', type_id: 't1', type: 'Tester', usage_needs_parent: false, sort_order: 0, is_active: true, ...audit }],
  tags: [{ id: 'tg1', display_name: 'Repair', sort_order: 1, is_active: true, color: 'yellow', ...audit }],
  'calibration-setup': [{ id: 'cc1', display_name: 'P12316', sort_order: 0, is_active: true, part_number_id: 'pn1', interval_months: 12, warning_days: 30, ...audit }],
};
const errorLog = [{ id: 'x1', request_id: 'req_1', route: 'GET /api/x', user_id: null, user_name: null, error_code: 'SERVER_ERROR', message: 'boom', stack: 'at x', created_at: audit.created_at }];

function respond(url: string): unknown {
  const path = url.split('?')[0]!;
  if (path === '/api/options') return options;
  if (path === '/api/equipment') return equipment;
  const one = path.match(/^\/api\/equipment\/([^/]+)$/);
  if (one) return equipment.find((e) => e.id === one[1]);
  if (/^\/api\/equipment\/[^/]+\/tree$/.test(path)) return { root_id: 'e1', nodes: [
    { id: 'e1', parent_id: null, part_number: 'P12316', serial_number: 'SN-ROOT' },
    { id: 'e2', parent_id: 'e1', part_number: null, serial_number: 'SN-CHILD' },
  ] };
  if (path.endsWith('/history')) return [{ id: 'h1', label: 'SN-ROOT', action: 'CHANGE_LOCATION', changes: { location: { old: 'B3F1', new: 'B3F2' } },
    note: 'via_parent:SN-ROOT', source: 'ui', created_at: audit.created_at, created_by: 'u1', created_by_name: 'Admin' }];
  // e1 đang theo dõi; e2 / e3 chưa có part number → chưa đưa vào được.
  // e1 có PN trong Setup hiệu chuẩn (tự lên Dashboard); e2 / e3 thì không.
  if (path === '/api/calibration/by-equipment/e1') return calibration[0];
  if (path.startsWith('/api/calibration/by-equipment/')) return null;
  if (path === '/api/equipment/part-numbers') return ['pn1'];
  if (path === '/api/calibration') return calibration;
  if (path === '/api/golden') return golden;
  if (path === '/api/users') return users;
  if (path === '/api/configuration/error-log') return errorLog;
  const cfg = path.match(/^\/api\/configuration\/([^/]+)$/);
  if (cfg) return config[cfg[1] as keyof typeof config] ?? [];
  throw new Error('unexpected GET ' + url);
}
vi.mock('@/lib/client/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client/api')>();
  return { ...actual, api: { get: vi.fn(async (url: string) => ({ data: respond(url), meta: {} })), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/client/api';
import { ViewerProvider } from '@/components/ViewerContext';
import { EquipmentWorkspace } from '@/components/equipment/EquipmentWorkspace';
import { CalibrationWorkspace } from '@/components/calibration/CalibrationWorkspace';
import { useEquipmentCalibrationSection } from '@/components/calibration/equipmentExtension';
import { GoldenWorkspace } from '@/components/golden/GoldenWorkspace';
import { UsersWorkspace } from '@/components/users/UsersWorkspace';
import { ConfigWorkspace } from '@/components/configuration/ConfigWorkspace';
import { ErrorLogWorkspace } from '@/components/configuration/ErrorLogWorkspace';
import { Dashboard } from '@/components/dashboard/Dashboard';
import type { Role } from '@/lib/permissions';

async function mount(node: ReactNode, role: Role = 'admin') {
  await act(async () => {
    render(<ViewerProvider viewer={{ userId: 'u1', username: 'admin', fullName: 'Admin', role }}>{node}</ViewerProvider>);
  });
}
const header = () => document.querySelector('.dp-header') as HTMLElement;
/** Bấm dòng đầu tiên có chữ này (chữ có thể lặp ở dòng khác, ví dụ cột Thiết bị cha). */
async function openRow(text: string) {
  await act(async () => { fireEvent.click(screen.getAllByText(text, { selector: 'td *, td' })[0]!); });
  expect(within(header()).getByRole('heading', { level: 2 })).toBeTruthy();
}
async function clickTab(name: string) {
  await act(async () => { fireEvent.click(within(header()).getByRole('tab', { name })); });
}
async function openActions() {
  await act(async () => { fireEvent.click(within(header()).getByRole('button', { name: /dp.actionsMenu/ })); });
}
async function clickEdit() {
  await act(async () => { fireEvent.click(within(header()).getByRole('button', { name: /common.edit/ })); });
  expect(screen.getAllByRole('button', { name: 'common.save' }).length).toBeGreaterThan(0);
}

function EquipmentPage() {
  const calibrationSection = useEquipmentCalibrationSection();
  return <EquipmentWorkspace extensions={[calibrationSection]} />;
}

describe('modules smoke', () => {
  it('Equipment: list → panel → tree → history → edit; calibration group via extension point', async () => {
    await mount(<EquipmentPage />);
    expect(screen.getByText('SN-CHILD')).toBeTruthy();
    await openRow('SN-ROOT');
    expect(screen.getByText('cal.groupCalibration')).toBeTruthy();
    expect(screen.getByText('cal.openCalibration')).toBeTruthy();
    await clickTab('eq.tabTree');
    expect(screen.getAllByText('SN-CHILD').length).toBeGreaterThan(1);
    await clickTab('dp.tabHistory');
    expect(screen.getByText('hist.action.CHANGE_LOCATION')).toBeTruthy();
    await clickTab('dp.tabInfo');
    await clickEdit();
  });

  it('Equipment whose part number is not set up for calibration: says why, no manual Add', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-OTHER');
    expect(screen.getByText('cal.notTracked')).toBeTruthy();
    expect(screen.getByText('cal.needsPartNumber')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cal\./ })).toBeNull();
  });

  it('Equipment child: parent is editable, location and level are locked with the reason', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-CHILD');
    await clickEdit();
    expect(screen.getByText('eq.locationFromParent')).toBeTruthy();
    expect(screen.getByText('eq.parentHint')).toBeTruthy();
    // Level theo cha: hiện Level của cha, không có ô chọn.
    const level = screen.getByText('eq.levelFromParent').closest('.dp-field') as HTMLElement;
    expect(within(level).getByText('EOL')).toBeTruthy();
    expect(screen.queryByLabelText(/fields.level/)).toBeNull();
  });

  it('Equipment with a part number: Type follows the part number and is locked in Edit', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    expect(screen.getByText('eq.fromPartNumber')).toBeTruthy();
    await clickEdit();
    expect(screen.getByText('eq.typeFromPartNumber')).toBeTruthy();
    expect(screen.queryByLabelText(/fields.type/)).toBeNull();
  });

  it('Equipment: Part Number is required and Type is never chosen by hand', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-OTHER');
    await clickEdit();
    expect(screen.getByText('eq.typeFromPartNumber')).toBeTruthy();
    expect(screen.queryByLabelText(/fields.type/)).toBeNull();
    const pn = screen.getByLabelText(/fields.part_number/).closest('.dp-field') as HTMLElement;
    expect(within(pn).getByText('*')).toBeTruthy();
  });

  it('Equipment parent: lists children; Actions → Add child opens the form with the parent filled in', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    expect(screen.getByText('fields.children')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'SN-CHILD' })).toBeTruthy();
    expect(screen.queryByText('eq.parentHint')).toBeNull();
    // Giao diện xem chỉ để xem: thêm con / gắn cha nằm trong nút Thao tác.
    expect(screen.queryByRole('button', { name: /eq.addChild/ })).toBeNull();
    await openActions();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /eq.addChild/ })); });
    expect(within(header()).getByRole('heading', { level: 2 }).textContent).toBe('eq.addChildTitle');
    // Cha cố định: hiện SN · PN · vị trí của cha, không có ô chọn; vị trí theo cha.
    expect(screen.getByText('eq.parentFixed')).toBeTruthy();
    expect(screen.getByText('SN-ROOT · P12316 · B3F1')).toBeTruthy();
    expect(screen.queryByLabelText(/fields.parent/)).toBeNull();
    // Vị trí và Level theo cha cố định — không có ô chọn.
    expect(screen.getAllByText('eq.followsFixedParent')).toHaveLength(2);
    expect(screen.queryByLabelText(/fields.level/)).toBeNull();

    // Lưu vẫn gửi thiết bị cha (ô khóa không nằm trong payload của form).
    vi.mocked(api.post).mockClear();
    vi.mocked(api.post).mockResolvedValueOnce({ data: equipment[1], meta: {} });
    await act(async () => { fireEvent.change(screen.getByLabelText(/fields.serial_number/), { target: { value: 'SN-NEW' } }); });
    await act(async () => { fireEvent.click(screen.getByLabelText(/fields.part_number/)); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'P12316' })); });
    // Type follows the chosen part number and is shown, not picked.
    const type = screen.getByText('eq.typeFromPartNumber').closest('.dp-field') as HTMLElement;
    expect(within(type).getByText('Tester')).toBeTruthy();
    // No Status field on the form: Status (In use / Not in use) is the system's. Tags are picked in the Remark section.
    expect(screen.queryByLabelText(/fields.status/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Repair' })); });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'common.save' })[0]!); });
    expect(api.post).toHaveBeenCalledWith('/api/equipment', expect.objectContaining({ serial_number: 'SN-NEW', part_number_id: 'pn1', tag_ids: ['tg1'], parent_id: 'e1' }));
    expect((api.post as ReturnType<typeof vi.fn>).mock.calls[0]![1]).not.toHaveProperty('status_id');
  });

  it('Remark section: tags are coloured toggles, saved as tag_ids; the list has no Status column of its own', async () => {
    await mount(<EquipmentPage />);
    expect(screen.queryByRole('columnheader', { name: /fields.status/ })).toBeNull();
    await openRow('SN-ROOT');
    expect(document.querySelector('.dp-body .tag-chips [data-status-color="yellow"]')?.textContent).toBe('Repair');
    await clickEdit();
    const repair = screen.getByRole('button', { name: 'Repair' });
    const spare = screen.getByRole('button', { name: 'Spare' });
    expect(repair.getAttribute('aria-pressed')).toBe('true');
    expect(spare.getAttribute('aria-pressed')).toBe('false');
    await act(async () => { fireEvent.click(spare); });
    vi.mocked(api.put).mockClear();
    vi.mocked(api.put).mockResolvedValueOnce({ data: equipment[0], meta: {} });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'common.save' })[0]!); });
    expect(api.put).toHaveBeenCalledWith('/api/equipment/e1', { tag_ids: ['tg1', 'tg2'] });
  });

  it('Golden sample and Calibration: tags in Remark; Golden has no Status, Calibration Status is computed (read-only)', async () => {
    await mount(<GoldenWorkspace />);
    expect(screen.queryByRole('columnheader', { name: /fields.status/ })).toBeNull();
    await openRow('GS-1');
    await clickEdit();
    expect(screen.queryByLabelText(/fields.status/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Repair' })).toBeTruthy();
  });

  it('Calibration: Status column shows the computed status', async () => {
    await mount(<CalibrationWorkspace />);
    expect(screen.getByRole('columnheader', { name: /fields.status/ })).toBeTruthy();
    expect(document.querySelector('td .tag-status[data-status-color="red"]')?.textContent).toBe('cal.status.overdue');
  });

  it('Usage: Check-out is offered for Not in use (and counts the children), Check-in for In use; the note is sent', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    await openActions();
    expect(screen.queryByRole('menuitem', { name: /eq.checkIn/ })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /eq.checkOut/ })); });
    // SN-ROOT is Not in use, its child SN-CHILD is already In use → only SN-ROOT changes.
    expect(screen.getByText('eq.usageAffectsValue')).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByLabelText(/eq.usageNote/), { target: { value: 'Line 3' } }); });
    vi.mocked(api.post).mockClear();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { changed: 1 }, meta: {} });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'eq.checkOut' }).pop()!); }); // the footer button, after the toolbar one
    expect(api.post).toHaveBeenCalledWith('/api/equipment/usage', { ids: ['e1'], usage: 'in_use', note: 'Line 3' });
  });

  it('Usage: toolbar Check-out lists only Not in use equipment; Check-in only In use', async () => {
    await mount(<EquipmentPage />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /eq.checkOut/ })); });
    const out = screen.getByRole('group', { name: 'eq.usagePick' });
    expect(within(out).getAllByRole('checkbox').map((c) => c.closest('label')!.querySelector('strong')!.textContent)).toEqual(['SN-OTHER', 'SN-ROOT']);
    const confirm = screen.getAllByRole('button', { name: /eq.checkOut/ }).pop() as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await act(async () => { fireEvent.click(within(out).getByRole('checkbox', { name: /SN-ROOT/ })); });
    // SN-ROOT (Not in use) + its child SN-CHILD (already In use): the child is not counted.
    expect(screen.getByText('eq.usageSelected')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: /eq.checkOut/ }).pop() as HTMLButtonElement).disabled).toBe(false);
    vi.mocked(api.post).mockClear();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { changed: 1 }, meta: {} });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /eq.checkOut/ }).pop()!); });
    expect(api.post).toHaveBeenCalledWith('/api/equipment/usage', { ids: ['e1'], usage: 'in_use', note: null });
  });

  it('Equipment without a parent: Actions → Attach to a parent opens the picker of existing equipment', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    expect(screen.getByText('eq.noParent')).toBeTruthy();
    await openActions();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /eq.attachParent/ })); });
    expect(screen.getByText('eq.newParent')).toBeTruthy();
    expect(screen.queryByText('eq.currentParent')).toBeNull();
  });

  it('Equipment child: shows its parent; Actions offers Move / Detach, not Attach', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-CHILD');
    expect(screen.getByRole('button', { name: /^SN-ROOT/ })).toBeTruthy();
    // Vị trí và Level: ghi nhỏ "theo thiết bị cha".
    expect(screen.getAllByText('eq.fromParent')).toHaveLength(2);
    await openActions();
    expect(screen.getByRole('menuitem', { name: /eq.move/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /eq.detach/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /eq.attachParent/ })).toBeNull();
  });

  it('Swap of an equipment with children: must choose go along / stay; the choice is sent', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    await openActions();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /eq.swap/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'eq.swapWith' })); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /SN-OTHER/ })); });
    expect(screen.getByText(/eq.chooseChildren/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'eq.swap' }) as HTMLButtonElement; // the button says what it does, not "Confirm"
    expect(confirm.disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /eq.childrenStay/ })); });
    expect(confirm.disabled).toBe(false);
    expect(screen.getByText('eq.kidsStay')).toBeTruthy();
    vi.mocked(api.post).mockResolvedValueOnce({ data: equipment[0], meta: {} });
    await act(async () => { fireEvent.click(confirm); });
    expect(api.post).toHaveBeenCalledWith('/api/equipment/swap', { a: 'e1', b: 'e3', children: 'stay' });
  });

  it('Swap only offers equipment of the same Type', async () => {
    const other = equipment.find((e) => e.id === 'e3')!;
    other.type_id = 't2'; other.type = 'Base';
    try {
      await mount(<EquipmentPage />);
      await openRow('SN-ROOT');
      await openActions();
      await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /eq.swap/ })); });
      expect(screen.getByText('eq.swapNoSameType')).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'eq.swapWith' })); });
      expect(screen.queryByRole('option', { name: /SN-OTHER/ })).toBeNull();
    } finally {
      other.type_id = 't1'; other.type = 'Tester';
    }
  });

  it('Delete of an equipment with children: its own screen asks delete the branch or keep the children', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    await openActions();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /common.delete/ })); });
    expect(screen.getByText('eq.deleteTitle')).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: /common.delete/ }).at(-1) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByRole('radio', { name: /eq.deleteFollow/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /eq.deleteStay/ })); });
    expect(confirm.disabled).toBe(false);
  });

  it('Edit of an equipment with children: changing the parent asks go along / stay', async () => {
    await mount(<EquipmentPage />);
    await openRow('SN-ROOT');
    await clickEdit();
    expect(screen.queryByText('eq.childrenQuestion')).toBeNull();
    const panel = document.querySelector('.dp') as HTMLElement;
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'fields.parent' })); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /SN-OTHER/ })); });
    expect(screen.getByText('eq.childrenQuestion')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'eq.editFollow' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'eq.editStayAlone' })).toBeTruthy();
  });

  it('Equipment for Readonly: no Add, no Edit', async () => {
    await mount(<EquipmentPage />, 'readonly');
    expect(screen.queryByRole('button', { name: /eq.add/ })).toBeNull();
    await openRow('SN-ROOT');
    expect(within(header()).queryByRole('button', { name: /common.edit/ })).toBeNull();
    expect(within(header()).queryByRole('button', { name: /dp.actionsMenu/ })).toBeNull();
  });

  it('Calibration: overdue row, Record calibration screen', async () => {
    await mount(<CalibrationWorkspace />);
    await openRow('SN-ROOT');
    await act(async () => { fireEvent.click(within(header()).getByRole('button', { name: /cal.record/ })); });
    expect(screen.getByText('cal.newDueDate')).toBeTruthy();
  });

  it('Golden: list → panel → edit', async () => {
    await mount(<GoldenWorkspace />);
    await openRow('GS-1');
    await clickEdit();
  });

  it('Users: pending account shows Approve / Reject', async () => {
    await mount(<UsersWorkspace />);
    await openRow('Bob');
    expect(within(header()).getByRole('button', { name: /usr.approve/ })).toBeTruthy();
    await act(async () => { fireEvent.click(within(header()).getByRole('button', { name: /usr.approve/ })); });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it.each(['part-numbers', 'tags', 'calibration-setup'] as const)('Configuration %s: list → panel → edit', async (list) => {
    await mount(<ConfigWorkspace listKey={list} />);
    await openRow(list === 'tags' ? 'Repair' : 'P12316');
    await clickEdit();
    // Setup hiệu chuẩn: part number khóa khi sửa (đổi PN = xóa rồi thêm lại).
    if (list === 'calibration-setup') expect(screen.getByText('cfg.partNumberFixed')).toBeTruthy();
  });

  it('Configuration part numbers: Type column in the list; Type is required when adding', async () => {
    await mount(<ConfigWorkspace listKey="part-numbers" />);
    expect(screen.getByRole('columnheader', { name: /fields.type/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /fields.usage_needs_parent/ })).toBeTruthy();
    expect(screen.getAllByText('Tester').length).toBeGreaterThan(0);

    const { api } = await import('@/lib/client/api');
    vi.mocked(api.post).mockClear();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /ml.add/ })[0]!); });
    expect(screen.getByText('cfg.partTypeHint')).toBeTruthy();
    expect(screen.getByText('cfg.usageNeedsParentHint')).toBeTruthy();
    await act(async () => { fireEvent.change(screen.getByLabelText(/fields.display_name/), { target: { value: 'P99999' } }); });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'common.save' })[0]!); });
    expect(api.post).not.toHaveBeenCalled();
    expect(within(screen.getByLabelText(/fields.type/).closest('.dp-field') as HTMLElement).getByRole('alert').textContent).toBe('dp.required');
  });

  it('Calibration masterlist has no manual Add (equipment joins via Configuration › Calibration › Setup)', async () => {
    await mount(<CalibrationWorkspace />);
    expect(screen.queryByRole('button', { name: /ml.add/ })).toBeNull();
  });

  it('Configuration tags: color chip in list; 5-color picker, required when adding; no remark / calibration fields', async () => {
    await mount(<ConfigWorkspace listKey="tags" />);
    expect(document.querySelector('td .tag-status[data-status-color="yellow"]')?.textContent).toBe('values.yellow');
    expect(screen.queryByRole('columnheader', { name: /fields.requires_remark|fields.calibration_role/ })).toBeNull();
    await openRow('Repair');
    await clickEdit();
    const picker = screen.getByRole('radiogroup', { name: 'fields.color' });
    expect(within(picker).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['green', 'yellow', 'red', 'blue', 'gray']);
    expect((within(picker).getByRole('radio', { checked: true }) as HTMLInputElement).value).toBe('yellow');

    const { api } = await import('@/lib/client/api');
    vi.mocked(api.post).mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /ml.add/ })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/fields.display_name/), { target: { value: 'Scrap' } }); });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'common.save' })[0]!); });
    expect(api.post).not.toHaveBeenCalled();
    expect(within(screen.getByRole('radiogroup', { name: 'fields.color' }).closest('.dp-field') as HTMLElement).getByRole('alert').textContent).toBe('dp.required');
  });

  it('Error log: read-only panel', async () => {
    await mount(<ErrorLogWorkspace />);
    await act(async () => { fireEvent.click(screen.getByText('req_1')); });
    expect(screen.getByText('at x')).toBeTruthy();
  });

  it('Dashboard renders KPIs, due lists and recent changes', async () => {
    const { api } = await import('@/lib/client/api');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/dashboard') {
        return { data: { equipment_total: 2, golden_total: 1, calibration_total: 1, pending_users: 1,
          by_status: {
            equipment: [{ id: 'in_use', label: null, count: 1, color: 'green' }, { id: 'not_in_use', label: null, count: 1, color: 'gray' }],
            calibration: [{ id: 'overdue', label: null, count: 1, color: 'red' }],
          },
          by_location: [], by_type: [],
          overdue: calibration, due_soon: [] }, meta: {} };
      }
      if (url.startsWith('/api/dashboard/activities')) {
        const base = { created_at: audit.created_at, created_by: 'u1', created_by_name: 'Admin', item_count: 1 };
        return { data: [
          { ...base, id: 'a1', module: 'equipment', object_id: 'e1', label: 'SN-ROOT', action: 'UPDATE',
            changes: { asset: { old: null, new: 'A1' } }, note: 'swap_with:SN-2', source: 'ui' },
          { ...base, id: 'a2', module: 'golden_sample', object_id: 'g1', label: 'G-1', action: 'CREATE',
            changes: {}, note: null, source: 'import', item_count: 40 },
        ], meta: {} };
      }
      return { data: respond(url), meta: {} };
    });
    await mount(<Dashboard />);
    expect(screen.getByText('dash.overdueTitle')).toBeTruthy();
    // Tổng quan trạng thái: mỗi trang một thanh màu, chú thích có tên + số.
    expect(screen.getByText('dash.byStatus')).toBeTruthy();
    expect(screen.getAllByRole('img').map((el) => el.getAttribute('aria-label'))).toEqual(['dash.statusOf', 'dash.statusOf']);
    // Status do hệ thống quản: server gửi khóa, màn hình dịch ra chữ.
    expect(document.querySelectorAll('.dash-stack-seg[data-status-color="red"]').length).toBe(1);
    expect(screen.getByText('values.in_use')).toBeTruthy();
    expect(screen.getByText('cal.status.overdue')).toBeTruthy();
    expect(screen.getAllByText('SN-ROOT').length).toBeGreaterThan(0);
    expect(screen.getByText('hist.action.UPDATE')).toBeTruthy();
    // Note của lịch sử hiện ở Dashboard; một lần import gộp thành một dòng, không liệt kê từng bản ghi.
    expect(screen.getByText('hist.swapWith')).toBeTruthy();
    expect(screen.getByText('dash.importedBatch')).toBeTruthy();
    expect(screen.queryByText('G-1')).toBeNull();
  });
});
