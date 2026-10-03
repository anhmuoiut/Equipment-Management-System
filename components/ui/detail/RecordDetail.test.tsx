// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o?.name ? `${key}:${o.name}` : key), i18n: { language: 'en' } }),
}));

import { RecordDetail, type SectionDef } from './RecordDetail';

type Row = {
  id: string; name: string; note: string | null;
  created_at: string; created_by: string | null; created_by_name: string | null;
  updated_at: string; updated_by: string | null; updated_by_name: string | null;
};
const row: Row = {
  id: 'r1', name: 'SN-001', note: 'old note',
  created_at: '2026-10-01T01:00:00Z', created_by: 'u1', created_by_name: 'Admin',
  updated_at: '2026-10-01T02:00:00Z', updated_by: 'u1', updated_by_name: 'Admin',
};
const sections: SectionDef<Row>[] = [{
  key: 'main', title: 'MAIN', fields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'note', label: 'Note', kind: 'textarea' },
  ],
}];

function setup(props: Partial<Parameters<typeof RecordDetail<Row>>[0]> = {}) {
  const onSave = vi.fn(async (payload: Record<string, unknown>) => ({ row: { ...row, ...payload } as Row }));
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn(async () => {});
  const onDeleted = vi.fn();
  const leaveRef = createRef<((go: () => void) => void) | null>() as { current: ((go: () => void) => void) | null };
  const utils = render(
    <RecordDetail<Row>
      layout="panel" record={row} heading={(r) => ({ title: r.name })} createTitle="New" sections={sections}
      canEdit onSave={onSave} onSaved={onSaved} onClose={onClose} canDelete onDelete={onDelete} onDeleted={onDeleted}
      leaveRef={leaveRef} {...props}
    />,
  );
  return { ...utils, onSave, onSaved, onClose, onDelete, onDeleted, leaveRef };
}

/** Nút Sửa trên header (thanh đáy điện thoại cũng có một nút Sửa, CSS ẩn trên desktop). */
const clickEdit = () => fireEvent.click(within(document.querySelector('.dp-header') as HTMLElement).getByRole('button', { name: /common.edit/ }));

describe('RecordDetail — docs/DETAIL_MODEL.md 3.5–3.8', () => {
  it('shows every field read-only, then a system-info group last', () => {
    setup();
    expect(screen.getByText('SN-001', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByText('old note')).toBeTruthy();
    const titles = [...document.querySelectorAll('.dp-section-title')].map((h) => h.textContent);
    expect(titles).toEqual(['MAIN', 'dp.systemInfo']);
    expect(document.querySelector('input, textarea')).toBeNull();
  });

  it('edits in place and saves only the changed fields', async () => {
    const { onSave, onSaved } = setup();
    clickEdit();
    const save = screen.getByRole('button', { name: 'common.save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: '  new note  ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })); });
    expect(onSave).toHaveBeenCalledWith({ note: 'new note' }, row);
    expect(onSaved).toHaveBeenCalled();
  });

  it('blocks saving when a required field is emptied', async () => {
    const { onSave } = setup();
    clickEdit();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })); });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('dp.required')).toBeTruthy();
  });

  it('asks before leaving with unsaved changes (Stay / Discard / Save)', () => {
    const { leaveRef } = setup();
    clickEdit();
    expect(leaveRef.current).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'changed' } });
    const go = vi.fn();
    act(() => leaveRef.current!(go));
    const footer = document.querySelector('.dp-footer')!;
    expect(within(footer as HTMLElement).getByText('dp.unsaved')).toBeTruthy();
    fireEvent.click(within(footer as HTMLElement).getByRole('button', { name: 'dp.stay' }));
    expect(go).not.toHaveBeenCalled();
    act(() => leaveRef.current!(go));
    fireEvent.click(screen.getByRole('button', { name: 'dp.discard' }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('Esc closes in view mode', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms delete in the footer, not in a second dialog', async () => {
    const { onDelete, onDeleted } = setup();
    fireEvent.click(screen.getByRole('button', { name: /dp.actionsMenu/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'common.delete' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByText('dp.confirmDelete:SN-001')).toBeTruthy();
    await act(async () => { fireEvent.click(within(document.querySelector('.dp-footer') as HTMLElement).getByRole('button', { name: /common.delete/ })); });
    expect(onDelete).toHaveBeenCalledWith(row);
    expect(onDeleted).toHaveBeenCalledWith(row);
  });

  it('hides Edit and delete for a read-only viewer', () => {
    setup({ canEdit: false, canDelete: false });
    expect(screen.queryByRole('button', { name: /common.edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /dp.actionsMenu/ })).toBeNull();
  });

  it('create mode starts empty, only the Information content, and sends filled fields', async () => {
    const { onSave } = setup({ record: null, creating: true });
    expect(screen.getByText('New', { selector: 'h2' })).toBeTruthy();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'SN-NEW' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'common.save' })); });
    expect(onSave).toHaveBeenCalledWith({ name: 'SN-NEW' }, null);
  });
});
