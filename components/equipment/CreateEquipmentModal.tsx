'use client';

/**
 * New equipment — Spec v0.9 mục 31, 39a.
 *
 * This was the one gap left in the equipment CRUD: `POST /api/equipment`
 * existed and was fully permission-checked, but nothing in the UI ever
 * called it. Deliberately kept separate from EquipmentDetailModal (which only ever
 * edits an existing row) rather than folding a "create" mode into it.
 *
 * Parent is optional and picked here directly, since most of a real
 * hierarchy (Base under a Tester, Fixture under a Base, …) is known at
 * creation time — otherwise every child row would need a second Move step
 * right after creating it. Location and Parent are mutually exclusive here
 * the same way they are for an existing record (mục 20/21): picking a
 * parent locks the location field to "follows the parent".
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type Equipment, type FieldDefinition, type LocationRef, type MasterDataRef, type StatusRef } from '@/lib/client/api';
import { Button, Modal, Notice } from '@/components/ui';
import { translateError } from '@/lib/i18n/errors';
import { DynamicForm, withRequiredRemark, type FormValues } from './DynamicForm';
import type { Me } from './EquipmentDetailModal';

type Props = {
  open: boolean;
  me: Me;
  fields: FieldDefinition[];
  locations: LocationRef[];
  equipmentTypes: MasterDataRef[];
  equipmentLevels: MasterDataRef[];
  equipmentStatuses: StatusRef[];
  onClose: () => void;
  onCreated: (result: { id: string; serialNumber: string; duplicateWarning: boolean }) => void;
};

function emptyValues(fields: FieldDefinition[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) v[f.field_key] = '';
  return v;
}

export function CreateEquipmentModal({
  open, me, fields, locations, equipmentTypes, equipmentLevels, equipmentStatuses, onClose, onCreated,
}: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [values, setValues] = useState<FormValues>(() => emptyValues(fields));
  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<Equipment[]>([]);
  const [parentId, setParentId] = useState('');
  const [parentLabel, setParentLabel] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset to a clean form every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setValues(emptyValues(fields));
    setParentQuery('');
    setParentResults([]);
    setParentId('');
    setParentLabel('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || parentId) return;
    const timer = setTimeout(() => {
      void api
        .get<Equipment[]>(`/api/equipment?pageSize=20&search=${encodeURIComponent(parentQuery)}`)
        .then((r) => setParentResults(r.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, parentQuery, parentId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Equipment>('/api/equipment', {
        fields: { ...values, parent_id: parentId || null },
      });
      onCreated({
        id: res.data.id,
        serialNumber: res.data.serial_number,
        duplicateWarning: !!res.meta.duplicate_warning,
      });
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} wide title={t('createEquipment.title')} onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="create-equipment-form" variant="primary" loading={busy}>{t('common.create')}</Button>
        </>
      }
    >
      <form id="create-equipment-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {error && !Object.keys(error.fieldErrors).length && (
          <Notice tone="alert">{translateError(error.code, language, error.message)}</Notice>
        )}

        <DynamicForm
          fields={withRequiredRemark(fields, values, equipmentStatuses)}
          values={values}
          onChange={setValues}
          editableFields={me.editable_fields}
          locations={locations}
          equipmentTypes={equipmentTypes}
          equipmentLevels={equipmentLevels}
          equipmentStatuses={equipmentStatuses}
          fieldErrors={error?.fieldErrors}
          mode="create"
          locationLockedReason={parentId
            ? t('createEquipment.locationFollowsSelectedParent')
            : null}
        />

        <div>
          <p className="text-[12px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {t('createEquipment.parentOptional')}
          </p>
          {parentId ? (
            <div className="mt-1 flex items-center justify-between border px-2.5 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <span className="ident">{parentLabel}</span>
              <button type="button" className="text-[11px] underline" style={{ color: 'var(--ink-2)' }}
                onClick={() => { setParentId(''); setParentLabel(''); }}>
                {t('createEquipment.remove')}
              </button>
            </div>
          ) : (
            <>
              <input
                value={parentQuery} onChange={(e) => setParentQuery(e.target.value)}
                placeholder={t('createEquipment.searchBySerial')}
                className="ident mt-1 w-full border px-2.5 py-1.5 text-[13px]"
                style={{ borderColor: 'var(--rule)' }}
              />
              {parentQuery.trim() && (
                <ul className="mt-1 max-h-40 overflow-y-auto border" style={{ borderColor: 'var(--rule-soft)' }}>
                  {parentResults.length === 0 && (
                    <li className="px-2.5 py-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                      {t('createEquipment.noMatchingEquipment')}
                    </li>
                  )}
                  {parentResults.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setParentId(r.id);
                          setParentLabel(`${r.part_number ?? '—'} | ${r.serial_number}`);
                          setParentQuery('');
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]"
                      >
                        <span className="ident font-medium">{r.serial_number}</span>
                        <span style={{ color: 'var(--ink-3)' }}>{r.part_number ?? ''}</span>
                        <span className="ml-auto" style={{ color: 'var(--ink-3)' }}>{r.current_location?.code ?? ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
