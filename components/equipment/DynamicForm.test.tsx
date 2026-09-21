// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldDefinition, LocationRef } from '@/lib/client/api';
import { DynamicForm, type FormValues } from './DynamicForm';

const STATUS_FIELD: FieldDefinition = {
  id: 'def-status', field_key: 'status', display_label: 'Status', data_type: 'text', input_type: 'dropdown',
  is_required: false, is_visible: true, display_order: 1, max_length: null, help_text: null, placeholder: null,
  is_system: false,
  dropdown_options: [
    { value: 'active', label: 'Active', is_active: true },
    { value: 'repair', label: 'Under Repair', is_active: true },
  ],
};

const LOCATION_FIELD: FieldDefinition = {
  id: 'def-location', field_key: 'current_location_id', display_label: 'Current Location', data_type: 'text', input_type: 'location_ref',
  is_required: false, is_visible: true, display_order: 2, max_length: null, help_text: null, placeholder: null,
  is_system: true,
  dropdown_options: null,
};

const LOCATIONS: LocationRef[] = [
  { id: 'loc-1', code: 'L1', name: 'Line 1', sort_order: 1 },
  { id: 'loc-2', code: 'L2', name: 'Line 2', sort_order: 2 },
];

function Harness({ mode, disabled }: { mode: 'create' | 'edit'; disabled: boolean }) {
  const [values, setValues] = useState<FormValues>({ status: 'active', current_location_id: 'loc-1' });
  return (
    <DynamicForm
      fields={[STATUS_FIELD, LOCATION_FIELD]}
      values={values}
      onChange={setValues}
      editableFields={null}
      locations={LOCATIONS}
      mode={mode}
      disabled={disabled}
    />
  );
}

describe('DynamicForm dropdown fields in edit mode', () => {
  it('lets the user change a dropdown field value when editing (disabled=false)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" disabled={false} />);

    const statusTrigger = screen.getByRole('button', { name: 'Status' });
    expect(statusTrigger.textContent).toContain('Active');
    await user.click(statusTrigger);
    await user.click(screen.getByText('Under Repair'));

    expect(statusTrigger.textContent).toContain('Under Repair');
  });

  it('lets the user change the Location field when editing (disabled=false)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" disabled={false} />);

    const locationTrigger = screen.getByRole('button', { name: 'Current Location' });
    expect(locationTrigger.textContent).toContain('L1 · Line 1');
    await user.click(locationTrigger);
    await user.click(screen.getByText('L2 · Line 2'));

    expect(locationTrigger.textContent).toContain('L2 · Line 2');
  });

  it('keeps the dropdown closed to changes when disabled=true (view mode)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" disabled />);

    const trigger = screen.getByRole('button', { name: 'Status' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
