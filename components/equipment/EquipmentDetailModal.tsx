'use client';

/**
 * Chi tiết thiết bị — "Equipment Inspector" reading experience: View mode
 * looks like a record you're reading, Edit mode is a deliberate, separate
 * state entered from the header, and structural actions (Change location /
 * parent / Swap / Detach / Archive / Restore / Print label) live in a
 * header dropdown rather than a form-adjacent button row.
 *
 * Mỗi thao tác đổi cấu trúc (Change Location / Move / Swap) đều phải hiện
 * SỐ DESCENDANTS SẼ BỊ ẢNH HƯỞNG trước khi user bấm đồng ý — đây là chỗ
 * người dùng dễ gây hậu quả ngoài ý muốn nhất.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive as ArchiveIcon, ArrowLeftRight, Box, ChevronDown, GitBranch,
  Layers3, MapPin, Network, Pencil, Plus, Printer, RotateCcw, Unlink,
} from 'lucide-react';
import {
  api, ApiError, formatRelativeTime, formatTime,
  type AuditEntry, type ContextNode, type Equipment,
  type FieldDefinition, type LocationRef, type MasterDataRef, type StatusRef,
} from '@/lib/client/api';
import { Button, Modal, Notice, Spinner, Tag, toast } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { fieldLabel, optionLabelL } from '@/lib/i18n/equipment';
import { translateError } from '@/lib/i18n/errors';
import { DynamicForm, changedFields, equipmentToFormValues, withRequiredRemark, type FormValues } from './DynamicForm';
import { HierarchyChain } from './HierarchyChain';
import { CalibrationPanel } from './CalibrationPanel';
import { RepairPanel } from './RepairPanel';

export type Me = {
  id: string; role: 'admin' | 'user' | 'viewer';
  permissions: string[];
  editable_fields: string[] | null;
};

export type DetailTab = 'info' | 'chain' | 'calibration' | 'repair' | 'history';

type Props = {
  id: string;
  me: Me;
  fields: FieldDefinition[];
  locations: LocationRef[];
  equipmentTypes: MasterDataRef[];
  equipmentLevels: MasterDataRef[];
  equipmentStatuses: StatusRef[];
  /** Opening from a row click or the View button always starts read-only. */
  initialMode?: 'view' | 'edit';
  /** Overrides the mode's default tab — e.g. the Calibration page opens
   *  straight on Calibration. */
  initialTab?: DetailTab;
  onClose: () => void;
  onChanged: () => void;
  onOpenOther: (id: string) => void;
};

type DialogKey = null | 'move' | 'location' | 'detach' | 'archive' | 'restore' | 'swap';

const IDENTITY_KEYS = new Set(['part_number', 'serial_number', 'types', 'level', 'status']);

// Exported — RepairPanel/CalibrationPanel/EquipmentMasterlist all need the
// same admin-bypasses-everything, viewer-only-gets-.view rule this modal's
// own Actions menu already uses below, instead of each re-deriving (or, as
// found by testing with a real admin account, forgetting) it independently.
export function hasPermission(me: Me, code: string): boolean {
  if (me.role === 'admin') return true;
  if (me.role === 'viewer') return code.endsWith('.view');
  return me.permissions.includes(code);
}

export function EquipmentDetailModal({
  id, me, fields, locations, equipmentTypes, equipmentLevels, equipmentStatuses,
  initialMode = 'view', initialTab, onClose, onChanged, onOpenOther,
}: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const [eq, setEq] = useState<Equipment | null>(null);
  const [ctx, setCtx] = useState<{ ancestors: ContextNode[]; descendants: ContextNode[] } | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  // Viewing read-only opens straight on the parent/child hierarchy — that's
  // what a click from the masterlist is usually trying to find out. Editing
  // opens on the Overview tab, since that's where the work actually happens.
  const [tab, setTab] = useState<DetailTab>(initialTab ?? (initialMode === 'edit' ? 'info' : 'chain'));
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);

  const [values, setValues] = useState<FormValues>({});
  const [original, setOriginal] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialog, setDialog] = useState<DialogKey>(null);

  const isViewer = me.role === 'viewer';
  const isArchived = !!eq?.archived_at;
  const hasParent = !!eq?.parent_id;
  const liveDescendants = (ctx?.descendants ?? []).filter((d) => !d.archived_at).length;

  // Esc đóng popup — nhưng nếu đang mở một dialog thao tác thì để dialog tự đóng trước.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, onClose]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [e, c] = await Promise.all([
        api.get<Equipment>(`/api/equipment/${id}`),
        api.get<{ ancestors: ContextNode[]; descendants: ContextNode[] }>(`/api/equipment/${id}/context`),
      ]);
      setEq(e.data);
      setCtx(c.data);
      setValues(equipmentToFormValues(e.data, fields));
      setOriginal(equipmentToFormValues(e.data, fields));
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== 'history' || history) return;
    void api.get<AuditEntry[]>(`/api/equipment/${id}/history`).then((r) => setHistory(r.data));
  }, [tab, history, id]);

  const editableFieldsForForm = useMemo(() => withRequiredRemark(fields, values, equipmentStatuses), [fields, values, equipmentStatuses]);

  const dirty = useMemo(
    () => Object.keys(changedFields(original, values, me.editable_fields)).length > 0,
    [original, values, me.editable_fields],
  );

  // Closes the active action dialog only on success. An error used to close
  // it unconditionally (in a `finally`) — which for the six action dialogs
  // (change location, change parent, swap, detach, archive, restore) meant
  // a failed request threw away whatever the user had searched/selected/
  // typed and surfaced the error as a banner behind a now-closed dialog,
  // forcing them to redo the whole flow. Every Admin CRUD form (Create
  // user, Edit field, Master data row) keeps its form open on error instead
  // — this matches that pattern.
  // Clears any error/flash left over from a previous action before opening
  // a new dialog, so it doesn't show up as if it belonged to this one.
  function openDialog(key: DialogKey) {
    setError(null);
    setDialog(key);
  }

  async function run<T>(fn: () => Promise<T>, successMsg: string): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      await fn();
      toast.success(successMsg);
      setHistory(null);
      await load();
      onChanged();
      setDialog(null);
      return true;
    } catch (err) {
      if (err instanceof ApiError) { setError(err); return false; }
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const ok = await run(
      () => api.put(`/api/equipment/${id}`, {
        version: eq!.version,
        fields: changedFields(original, values, me.editable_fields),
      }),
      t('equipmentDetail.changesSaved'),
    );
    if (ok) setMode('view');
  }

  function cancelEdit() {
    setValues(original);
    setMode('view');
  }

  if (!eq) {
    return (
      <div className="equipment-detail">
        {error ? (
          <div className="p-5"><Notice tone="alert" dismissLabel={t('common.close')}>{translateError(error.code, language, error.message)}</Notice></div>
        ) : <Spinner label={t('equipmentDetail.loadingEquipment')} />}
      </div>
    );
  }

  const canEditAnything = !isViewer && !isArchived &&
    (me.editable_fields === null || me.editable_fields.length > 0);
  const locationDef = fields.find((f) => f.field_key === 'current_location_id');
  const Icon = eq.type?.code === 'tester' ? Network : eq.type?.code === 'base' ? Layers3 : Box;
  const name = eq.type?.display_name ?? t('hierarchy.equipmentLabel');
  const identityFields = fields.filter((f) => IDENTITY_KEYS.has(f.field_key));
  const additionalFields = fields.filter((f) => !IDENTITY_KEYS.has(f.field_key) && f.field_key !== 'current_location_id');
  const locationLockedReason = hasParent
    ? t('equipmentDetail.locationFollowsParent') : t('equipmentDetail.locationChangeViaAction');

  return (
    <div className="equipment-detail">
      {/* đầu popup */}
      <header className="equipment-detail-header flex shrink-0 items-start justify-between gap-3 border-b" style={{ borderColor: 'var(--rule)' }}>
        <div className="detail-header-main min-w-0 flex-1">
          <div className="detail-header-icon"><Icon size={18} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <div className="detail-header-title-row">
              <span className="detail-header-typename">{name}</span>
              {isArchived && <Tag text={t('equipmentDetail.archived')} tone="warn" />}
              {hasParent && <Tag text={t('equipmentDetail.hasParent')} />}
              {!isArchived && eq.status && (
                <span className="equipment-status" data-status={eq.status.code}>
                  {eq.status.display_name}
                </span>
              )}
            </div>
            <div className="detail-header-idents">
              <span className="ident detail-header-part">{eq.part_number ?? t('hierarchy.noPartNumber')}</span>
              <span className="ident detail-header-serial">{eq.serial_number}</span>
            </div>
            <p className="detail-header-meta">
              <span className="detail-header-meta-item"><MapPin size={12} aria-hidden="true" />{eq.current_location?.code ?? '—'}</span>
              {eq.parent && (
                <button type="button" className="detail-header-parent-link" onClick={() => onOpenOther(eq.parent!.id)}>
                  {t('equipmentDetail.parentEquipment')}: <span className="ident">{eq.parent.part_number ?? eq.parent.serial_number}</span>
                </button>
              )}
              <span>{t('equipmentDetail.updated')} {formatRelativeTime(eq.updated_at, language)}</span>
              <span className="detail-header-version" title={`${t('equipmentDetail.version')} ${eq.version} · ${formatTime(eq.updated_at)}`}>
                v{eq.version}
              </span>
            </p>
            {isArchived && me.role !== 'admin' && (
              <p className="detail-header-archived-note">{t('equipmentDetail.archivedRestoreAdminOnly')}</p>
            )}
          </div>
        </div>
        <div className="detail-header-actions">
          {mode === 'view' && canEditAnything && (
            <Button size="sm" variant="primary" onClick={() => setMode('edit')}><Pencil size={13} aria-hidden="true" />{t('common.edit')}</Button>
          )}
          <ActionsMenu me={me} hasParent={hasParent} isArchived={isArchived} isViewer={isViewer} onSelect={openDialog} equipmentId={eq.id} />
          {isArchived && me.role === 'admin' && (
            <Button size="sm" variant="primary" onClick={() => openDialog('restore')}><RotateCcw size={13} aria-hidden="true" />{t('equipmentDetail.restore')}</Button>
          )}
          <Button size="sm" onClick={onClose} aria-label={t('common.close')}>{t('common.close')}</Button>
        </div>
      </header>

      {/* tab */}
      <nav className="equipment-detail-tabs flex shrink-0 flex-wrap gap-4 border-b" style={{ borderColor: 'var(--rule)' }}>
        {([
          ['info', t('equipmentDetail.tabInformation')],
          ['chain', t('equipmentDetail.tabHierarchy')],
          ['calibration', t('calibration.title')],
          ['repair', t('repair.title')],
          ['history', t('equipmentDetail.tabHistory')],
        ] as const).map(([k, label]) => (
          <button
            key={k} onClick={() => setTab(k)}
            className="border-b-2 py-2 text-[13px] font-medium"
            style={{
              borderColor: tab === k ? 'var(--machine)' : 'transparent',
              color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
            }}
          >
            {label}
            {k === 'chain' && liveDescendants > 0 && (
              <span className="ml-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>{liveDescendants}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="equipment-detail-body">
        {error && (
          <div className="mb-4">
            <Notice tone={error.isConflict ? 'warn' : 'alert'} dismissLabel={t('common.close')} onDismiss={() => setError(null)}>
              <p>{translateError(error.code, language, error.message)}</p>
              {error.isConflict && (
                <button onClick={() => void load()} className="mt-1 underline">{t('equipmentDetail.reloadLatestData')}</button>
              )}
              {!error.isConflict && error.requestId !== '-' && (
                <p className="ident mt-1 text-[11px]">{t('equipmentDetail.requestId')}: {error.requestId}</p>
              )}
            </Notice>
          </div>
        )}

        {tab === 'info' && (
          <div className={mode === 'edit' ? 'detail-overview-edit' : undefined}>
            {identityFields.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">{t('equipmentDetail.sectionIdentity')}</h3>
                <DynamicForm
                  fields={identityFields} values={values} onChange={setValues}
                  editableFields={me.editable_fields} locations={locations}
                  equipmentTypes={equipmentTypes} equipmentLevels={equipmentLevels} equipmentStatuses={equipmentStatuses}
                  fieldErrors={error?.fieldErrors} mode="edit"
                  disabled={isViewer || isArchived} viewOnly={mode === 'view'}
                />
              </section>
            )}

            <section className="detail-section">
              <h3 className="detail-section-title">{t('equipmentDetail.sectionLocation')}</h3>
              <div className="detail-location-card">
                <div>
                  <p className="field-display-label">{locationDef ? fieldLabel(locationDef, language) : t('equipmentDetail.updated')}</p>
                  <p className="field-display-value ident">
                    {eq.current_location ? `${eq.current_location.code}${eq.current_location.name && eq.current_location.name !== eq.current_location.code ? ` · ${eq.current_location.name}` : ''}` : '—'}
                  </p>
                  {mode === 'edit' && <p className="detail-location-note">{locationLockedReason}</p>}
                </div>
                <div>
                  <p className="field-display-label">{t('equipmentDetail.parentEquipment')}</p>
                  {eq.parent ? (
                    <button type="button" className="detail-parent-link" onClick={() => onOpenOther(eq.parent!.id)}>
                      <span className="ident">{eq.parent.part_number ?? eq.parent.serial_number}</span>
                      {eq.parent.part_number && <span className="ident detail-parent-serial">{eq.parent.serial_number}</span>}
                    </button>
                  ) : <p className="field-display-value">{t('equipmentDetail.noParentStandalone')}</p>}
                </div>
              </div>
            </section>

            {additionalFields.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">{t('equipmentDetail.sectionAdditional')}</h3>
                <DynamicForm
                  fields={mode === 'edit' ? editableFieldsForForm.filter((f) => !IDENTITY_KEYS.has(f.field_key) && f.field_key !== 'current_location_id') : additionalFields}
                  values={values} onChange={setValues}
                  editableFields={me.editable_fields} locations={locations}
                  equipmentTypes={equipmentTypes} equipmentLevels={equipmentLevels} equipmentStatuses={equipmentStatuses}
                  fieldErrors={error?.fieldErrors} mode="edit"
                  disabled={isViewer || isArchived} viewOnly={mode === 'view'}
                />
              </section>
            )}

            {mode === 'edit' && (
              <footer className="detail-edit-footer">
                <span className="detail-edit-status">
                  {dirty ? t('equipmentDetail.unsavedChanges') : t('equipmentDetail.noUnsavedChanges')}
                </span>
                <div className="flex items-center gap-2">
                  {dirty && <Button size="sm" disabled={busy} onClick={() => setValues(original)}>{t('equipmentDetail.resetChanges')}</Button>}
                  <Button size="sm" disabled={busy} onClick={cancelEdit}>{t('common.cancel')}</Button>
                  <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={() => void save()}>
                    {busy ? t('equipmentDetail.saving') : t('equipmentDetail.saveChanges')}
                  </Button>
                </div>
              </footer>
            )}
          </div>
        )}

        {tab === 'chain' && ctx && (
          <HierarchyChain
            current={eq}
            ancestors={ctx.ancestors}
            descendants={ctx.descendants}
            locations={locations}
            types={equipmentTypes}
            statuses={equipmentStatuses}
            onOpen={onOpenOther}
          />
        )}

        {tab === 'calibration' && <CalibrationPanel equipmentId={eq.id} me={me} disabled={isViewer || isArchived} onChanged={onChanged} />}
        {tab === 'repair' && <RepairPanel equipmentId={eq.id} me={me} disabled={isViewer || isArchived} />}

        {tab === 'history' && (
          history === null ? <Spinner label={t('equipmentDetail.loadingHistory')} /> : <HistoryList entries={history} fields={fields} equipmentTypes={equipmentTypes} equipmentLevels={equipmentLevels} equipmentStatuses={equipmentStatuses} locations={locations} />
        )}
      </div>

      <ActionDialogs
        dialog={dialog}
        eq={eq}
        locations={locations}
        liveDescendants={liveDescendants}
        busy={busy}
        error={error}
        language={language}
        onCancel={() => setDialog(null)}
        onRun={run}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionsMenu({
  me, hasParent, isArchived, isViewer, onSelect, equipmentId,
}: { me: Me; hasParent: boolean; isArchived: boolean; isViewer: boolean; onSelect: (key: DialogKey) => void; equipmentId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const items: { key: DialogKey | 'print'; label: string; danger?: boolean; icon?: typeof Printer }[] = [];
  items.push({ key: 'print', label: t('label.printLabel'), icon: Printer });
  if (!isArchived && !isViewer) {
    if (!hasParent) items.push({ key: 'location', label: t('equipmentDetail.changeLocation') });
    if (hasPermission(me, 'equipment.move')) items.push({ key: 'move', label: t('equipmentDetail.changeParent') });
    if (hasPermission(me, 'equipment.move')) items.push({ key: 'swap', label: t('equipmentDetail.swap') });
    if (hasParent && hasPermission(me, 'equipment.detach')) items.push({ key: 'detach', label: t('equipmentDetail.detachFromParent') });
    if (hasPermission(me, 'equipment.archive')) items.push({ key: 'archive', label: t('equipmentDetail.archive'), danger: true });
  }

  return (
    <div className="detail-actions-menu" ref={ref}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}>
        {t('equipmentDetail.actions')} <ChevronDown size={13} aria-hidden="true" />
      </Button>
      {open && (
        <ul className="detail-actions-menu-list" role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button" role="menuitem" data-danger={item.danger || undefined}
                onClick={() => {
                  setOpen(false);
                  if (item.key === 'print') window.open(`/equipment/${equipmentId}/label`, '_blank', 'noopener');
                  else onSelect(item.key);
                }}
              >
                {item.icon && <item.icon size={14} aria-hidden="true" />} {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const ACTION_KEYS: Record<string, string> = {
  CREATE: 'equipmentDetail.historyAction.create',
  UPDATE: 'equipmentDetail.historyAction.update',
  CHANGE_LOCATION: 'equipmentDetail.historyAction.changeLocation',
  MOVE: 'equipmentDetail.historyAction.move',
  MOVE_CASCADE: 'equipmentDetail.historyAction.moveCascade',
  SWAP: 'equipmentDetail.historyAction.swap',
  DETACH: 'equipmentDetail.historyAction.detach',
  ARCHIVE: 'equipmentDetail.historyAction.archive',
  RESTORE: 'equipmentDetail.historyAction.restore',
};

const ACTION_ICONS: Record<string, typeof Plus> = {
  CREATE: Plus,
  UPDATE: Pencil,
  CHANGE_LOCATION: MapPin,
  MOVE: GitBranch,
  MOVE_CASCADE: MapPin,
  SWAP: ArrowLeftRight,
  DETACH: Unlink,
  ARCHIVE: ArchiveIcon,
  RESTORE: RotateCcw,
};

function actionLabel(action: string, t: (key: string) => string): string {
  const key = ACTION_KEYS[action];
  return key ? t(key) : action;
}

function HistoryList({
  entries, fields, equipmentTypes, equipmentLevels, equipmentStatuses, locations,
}: {
  entries: AuditEntry[]; fields: FieldDefinition[];
  equipmentTypes: MasterDataRef[]; equipmentLevels: MasterDataRef[]; equipmentStatuses: MasterDataRef[]; locations: LocationRef[];
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const defByKey = new Map(fields.map((f) => [f.field_key, f]));

  if (entries.length === 0) {
    return <p className="py-6 text-[13px]" style={{ color: 'var(--ink-3)' }}>{t('equipmentDetail.noChangesRecorded')}</p>;
  }

  return (
    <ol className="detail-history-list">
      {entries.map((e) => {
        const HistoryIcon = ACTION_ICONS[e.action] ?? Pencil;
        return (
          <li key={e.id} className="detail-history-entry">
            <span className="detail-history-icon"><HistoryIcon size={13} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{actionLabel(e.action, t)}</span>
                <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{formatTime(e.created_at)}</span>
              </div>
              <p className="detail-history-byline">
                {e.actor_name ? t('equipmentDetail.historyBy', { name: e.actor_name }) : null}
                {e.note ? <span>{e.actor_name ? ' · ' : ''}{t('equipmentDetail.historyReason', { note: e.note })}</span> : null}
              </p>

              {e.action !== 'CREATE' && (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(e.changes).map(([key, diff]) => {
                    const def = defByKey.get(key);
                    // parent_id/type_id/level_id/status_id/current_location_id
                    // are already resolved server-side (lib/services/equipment.ts,
                    // resolveHistoryLabels) to a label a person recognizes, not a uuid.
                    const label = key === 'parent_id' ? t('hierarchy.parentLabel')
                      : key === 'type_id' ? t('dashboard.type')
                      : key === 'level_id' ? t('dashboard.level')
                      : key === 'status_id' ? t('dashboard.status')
                      : def ? fieldLabel(def, language) : key;
                    const isIdentifier = ['parent_id', 'current_location_id', 'type_id', 'level_id', 'status_id'].includes(key);
                    const fmt = (v: unknown) =>
                      v === null || v === undefined || v === ''
                        ? '—'
                        : def?.input_type === 'dropdown'
                          ? optionLabelL(def, String(v), language)
                          : String(v);
                    return (
                      <li key={key} className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {label}: <span className={isIdentifier ? 'ident' : undefined} style={{ color: 'var(--ink-3)' }}>{fmt(diff.old)}</span>
                        {' → '}
                        <span className={isIdentifier ? 'ident' : undefined}>{fmt(diff.new)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {e.source === 'migration' && (
                <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>{t('equipmentDetail.importedFromLegacy')}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------

function ActionDialogs({
  dialog, eq, locations, liveDescendants, busy, error, language, onCancel, onRun,
}: {
  dialog: DialogKey;
  eq: Equipment;
  locations: LocationRef[];
  liveDescendants: number;
  busy: boolean;
  error: ApiError | null;
  language: 'en' | 'vi';
  onCancel: () => void;
  onRun: <T>(fn: () => Promise<T>, msg: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  // Shown inside whichever dialog is open — an action's error used to only
  // surface in the main panel behind it, invisible while the dialog (now
  // kept open on error, see `run()` above) covers the screen.
  const dialogError = error && <Notice tone={error.isConflict ? 'warn' : 'alert'}>{translateError(error.code, language, error.message)}</Notice>;
  const [locationId, setLocationId] = useState('');
  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<Equipment[]>([]);
  const [parentId, setParentId] = useState('');

  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState<Equipment[]>([]);
  const [swapTarget, setSwapTarget] = useState<Equipment | null>(null);
  const [swapNote, setSwapNote] = useState('');

  useEffect(() => {
    if (dialog !== 'move') return;
    const timer = setTimeout(() => {
      // Backend loại sẵn chính nó + toàn bộ subtree + thiết bị đã archive,
      // nên UI không bao giờ mời chọn giá trị chắc chắn bị từ chối.
      void api
        .get<Equipment[]>(
          `/api/equipment?parentPickerFor=${eq.id}&pageSize=20&search=${encodeURIComponent(parentQuery)}`,
        )
        .then((r) => setParentResults(r.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [dialog, parentQuery, eq.id]);

  useEffect(() => {
    if (dialog !== 'swap') { setSwapTarget(null); setSwapQuery(''); setSwapNote(''); return; }
    const timer = setTimeout(() => {
      // Same self/subtree exclusion as Move — a swap partner can never be an
      // ancestor or descendant of the equipment being swapped either
      // (backend also re-checks this: SWAP_INVALID_ANCESTOR_RELATION).
      // Eligibility is Type only — Part Number is not considered.
      const params = new URLSearchParams({ parentPickerFor: eq.id, pageSize: '20', search: swapQuery });
      if (eq.type_id) params.set('filters[type_id]', eq.type_id);
      void api.get<Equipment[]>(`/api/equipment?${params}`).then((r) => setSwapResults(r.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [dialog, swapQuery, eq.id, eq.type_id]);

  const affected = liveDescendants > 0
    ? t('equipmentDetail.dialog.willChangeLocationOfChildren', { count: liveDescendants })
    : null;

  return (
    <>
      <Modal open={dialog === 'location'} title={t('equipmentDetail.dialog.changeLocationTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="primary" disabled={!locationId} loading={busy}
              onClick={() => void onRun(
                () => api.post(`/api/equipment/${eq.id}/change-location`,
                  { version: eq.version, new_location_id: locationId }),
                t('equipmentDetail.dialog.locationChanged'),
              )}
            >
              {t('equipmentDetail.changeLocation')}
            </Button>
          </>
        }
      >
        {dialogError}
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          {t('equipmentDetail.dialog.chooseNewLocationFor')} <span className="ident">{eq.serial_number}</span>.
        </p>
        <SearchableSelect
          value={locationId} onChange={setLocationId} clearable
          placeholder={t('equipmentDetail.dialog.selectALocation')}
          ariaLabel={t('equipmentDetail.dialog.selectALocation')}
          options={locations.map((l) => ({ value: l.id, label: l.code }))}
          className="mt-3 w-full border px-2 py-1.5 text-[13px]"
          style={{ borderColor: 'var(--rule)' }}
        />
        {affected && <p className="mt-3 text-[12px]" style={{ color: 'var(--warn)' }}>{affected}</p>}
      </Modal>

      <Modal open={dialog === 'move'} title={t('equipmentDetail.dialog.changeParentTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="primary" disabled={!parentId} loading={busy}
              onClick={() => void onRun(
                () => api.post(`/api/equipment/${eq.id}/move`,
                  { version: eq.version, new_parent_id: parentId }),
                t('equipmentDetail.dialog.parentChanged'),
              )}
            >
              {t('equipmentDetail.changeParent')}
            </Button>
          </>
        }
      >
        {dialogError}
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          {t('equipmentDetail.dialog.searchBySerialExcludeDescendants')}
        </p>
        <input
          autoFocus value={parentQuery} onChange={(e) => setParentQuery(e.target.value)}
          placeholder={t('equipmentDetail.dialog.enterSerialNumber')}
          className="ident mt-3 w-full border px-2 py-1.5 text-[13px]"
          style={{ borderColor: 'var(--rule)' }}
        />
        <ul className="mt-2 max-h-52 overflow-y-auto border" style={{ borderColor: 'var(--rule-soft)' }}>
          {parentResults.length === 0 && (
            <li className="px-2.5 py-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
              {t('equipmentDetail.dialog.noMatchingEquipment')}
            </li>
          )}
          {parentResults.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setParentId(r.id)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]"
                style={{ background: parentId === r.id ? 'var(--machine-tint)' : 'transparent' }}
              >
                <span className="ident font-medium">{r.serial_number}</span>
                <span style={{ color: 'var(--ink-3)' }}>{r.part_number ?? ''}</span>
                <span className="ml-auto" style={{ color: 'var(--ink-3)' }}>
                  {r.current_location?.code ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px]" style={{ color: 'var(--warn)' }}>
          {liveDescendants > 0
            ? t('equipmentDetail.dialog.childrenWillMoveToNewParentLocation', { count: liveDescendants })
            : t('equipmentDetail.dialog.locationWillFollowNewParent')}
        </p>
      </Modal>

      <Modal open={dialog === 'swap'} wide title={t('equipmentDetail.dialog.swapTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="primary" disabled={!swapTarget} loading={busy}
              onClick={() => void onRun(
                () => api.post('/api/equipment/swap', {
                  equipment_a_id: eq.id, equipment_b_id: swapTarget!.id,
                  version_a: eq.version, version_b: swapTarget!.version,
                  note: swapNote.trim() || undefined,
                }),
                t('equipmentDetail.dialog.swapped'),
              )}
            >
              {t('equipmentDetail.dialog.confirmSwap')}
            </Button>
          </>
        }
      >
        {dialogError}
        {!swapTarget ? (
          <>
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {t('equipmentDetail.dialog.searchBySerialSameType')}
            </p>
            <input
              autoFocus value={swapQuery} onChange={(e) => setSwapQuery(e.target.value)}
              placeholder={t('equipmentDetail.dialog.enterSerialNumber')}
              className="ident mt-3 w-full border px-2 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--rule)' }}
            />
            <ul className="mt-2 max-h-52 overflow-y-auto border" style={{ borderColor: 'var(--rule-soft)' }}>
              {swapResults.length === 0 && (
                <li className="px-2.5 py-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  {t('equipmentDetail.dialog.noEligibleEquipment')}
                </li>
              )}
              {swapResults.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSwapTarget(r)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px]"
                  >
                    <span className="ident font-medium">{r.serial_number}</span>
                    <span style={{ color: 'var(--ink-3)' }}>{r.part_number ?? ''}</span>
                    <span className="ml-auto" style={{ color: 'var(--ink-3)' }}>{r.current_location?.code ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="border p-3 text-[12px]" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>{t('equipmentDetail.dialog.before')}</p>
              <p className="mt-1"><span className="ident font-medium">{eq.serial_number}</span> → <span className="ident">{eq.current_location?.code ?? '—'}</span></p>
              <p><span className="ident font-medium">{swapTarget.serial_number}</span> → <span className="ident">{swapTarget.current_location?.code ?? '—'}</span></p>
              <p className="mt-3 font-semibold" style={{ color: 'var(--ink-2)' }}>{t('equipmentDetail.dialog.after')}</p>
              <p className="mt-1"><span className="ident font-medium">{eq.serial_number}</span> → <span className="ident">{swapTarget.current_location?.code ?? '—'}</span></p>
              <p><span className="ident font-medium">{swapTarget.serial_number}</span> → <span className="ident">{eq.current_location?.code ?? '—'}</span></p>
            </div>
            <button type="button" onClick={() => setSwapTarget(null)} className="mt-2 text-[11px] underline" style={{ color: 'var(--ink-2)' }}>
              {t('equipmentDetail.dialog.chooseDifferentEquipment')}
            </button>
            <label className="mt-3 block text-[12px]">
              {t('equipmentDetail.dialog.reasonOptional')}
              <textarea
                value={swapNote} onChange={(e) => setSwapNote(e.target.value)} rows={2} maxLength={500}
                className="mt-1 w-full resize-y border px-2 py-1.5 text-[13px]" style={{ borderColor: 'var(--rule)' }}
              />
            </label>
          </>
        )}
        {liveDescendants > 0 && (
          <p className="mt-3 text-[12px]" style={{ color: 'var(--warn)' }}>
            {t('equipmentDetail.dialog.childrenWillMoveTogether', { count: liveDescendants })}
          </p>
        )}
      </Modal>

      <Modal open={dialog === 'detach'} title={t('equipmentDetail.dialog.detachTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="primary" loading={busy}
              onClick={() => void onRun(
                () => api.post(`/api/equipment/${eq.id}/detach`, { version: eq.version }),
                t('equipmentDetail.dialog.detached'),
              )}
            >
              {t('equipmentDetail.dialog.detach')}
            </Button>
          </>
        }
      >
        {dialogError}
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          <span className="ident">{eq.serial_number}</span> {t('equipmentDetail.dialog.detachDescription')}
        </p>
      </Modal>

      <Modal open={dialog === 'archive'} title={t('equipmentDetail.dialog.archiveTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="danger" disabled={liveDescendants > 0} loading={busy}
              onClick={() => void onRun(
                () => api.post(`/api/equipment/${eq.id}/archive`, { version: eq.version }),
                t('equipmentDetail.dialog.archived'),
              )}
            >
              {t('equipmentDetail.archive')}
            </Button>
          </>
        }
      >
        {dialogError}
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          {t('equipmentDetail.dialog.archiveDescription')}
        </p>
        {liveDescendants > 0 && (
          <p className="mt-3 text-[12px]" style={{ color: 'var(--warn)' }}>
            {t('equipmentDetail.dialog.archiveBlockedChildren', { count: liveDescendants })}
          </p>
        )}
      </Modal>

      <Modal open={dialog === 'restore'} title={t('equipmentDetail.dialog.restoreTitle')} onClose={onCancel}
        footer={
          <>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button
              variant="primary" loading={busy}
              onClick={() => void onRun(
                () => api.post(`/api/equipment/${eq.id}/restore`, { version: eq.version }),
                t('equipmentDetail.dialog.restored'),
              )}
            >
              {t('equipmentDetail.restore')}
            </Button>
          </>
        }
      >
        {dialogError}
        <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          {t('equipmentDetail.dialog.restoreDescription')}
        </p>
      </Modal>
    </>
  );
}
