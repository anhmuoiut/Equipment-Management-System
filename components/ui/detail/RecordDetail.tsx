'use client';

/**
 * RecordDetail — một panel cho xem / sửa / thêm mới / thao tác / xóa
 * (docs/DETAIL_MODEL.md 3.5–3.8). Mỗi module chỉ khai báo nhóm trường, tab,
 * thao tác; khung lo chế độ, kiểm tra bắt buộc, lỗi theo ô, "có thay đổi
 * chưa lưu", phím tắt, và nhóm "Thông tin hệ thống" ở cuối.
 *
 * Không mở hộp thoại chồng lên panel: thao tác thay thân panel (ActionScreen),
 * xác nhận xóa / bỏ thay đổi nằm ngay ở footer.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { ApiError, errorMessage, formatTime } from '@/lib/client/api';
import { usePhone } from '@/lib/client/usePhone';
import { Button, ErrorState, LoadingOverlay, Notice, RequiredMark, Skeleton, toast } from '@/components/ui';
import { SearchableSelect, type SelectOption } from '@/components/ui/SearchableSelect';
import { ActionMenu, type MoreItem } from '@/components/ui/ActionMenu';
import { DetailPanel, DetailSection, DetailValue, type PanelLayout } from './DetailPanel';
import { DetailHistory } from './DetailHistory';
import type { Audit } from '@/lib/types';

export type Draft = Record<string, unknown>;
export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'date' | 'number' | 'checkboxes' | 'boolean' | 'password';

export type FieldDef<R> = {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean | ((draft: Draft) => boolean);
  options?: SelectOption[] | ((draft: Draft, record: R | null) => SelectOption[]);
  /** Vẽ một lựa chọn của ô radio (ví dụ chip màu) — dùng cả khi xem. */
  optionView?: (option: SelectOption) => ReactNode;
  /** Hiển thị khi xem (mặc định: giá trị / nhãn lựa chọn). */
  view?: (record: R) => ReactNode;
  /** Hiển thị khi đang thêm / sửa mà ô bị khóa — theo giá trị đang nhập (ví dụ vị trí theo thiết bị cha đang chọn). */
  draftView?: (draft: Draft) => ReactNode;
  /** Khóa khi sửa — trả về lý do (hiện dưới ô). */
  lock?: (record: R | null, draft: Draft) => string | null;
  /** Luôn chỉ đọc (ví dụ trường tự tính). */
  readOnly?: boolean;
  hint?: string;
  /** Gợi ý chỉ hiện khi đang nhập (thêm / sửa), thay cho `hint`. */
  editHint?: string;
  wide?: boolean;
  /** Chỉ có khi thêm mới (ví dụ mật khẩu ban đầu). */
  createOnly?: boolean;
  /** Không có khi thêm mới. */
  hideInCreate?: boolean;
  /** Trường chỉ dùng khi nhập: hiện (và kiểm tra, gửi đi) khi đang thêm / sửa và điều kiện đúng. */
  when?: (draft: Draft, record: R | null) => boolean;
  min?: number;
  max?: number;
  maxLength?: number;
};

export type SectionDef<R> = {
  key: string;
  title: string;
  fields?: FieldDef<R>[];
  /** Nhóm tự vẽ (extension point, nhóm chỉ đọc của module khác). */
  render?: (record: R) => ReactNode;
  hideInCreate?: boolean;
};

/** `removed`: màn hình thao tác đã xóa bản ghi (ví dụ màn hình Xóa riêng của module). */
export type ActionCtx<R> = {
  record: R; cancel: () => void; done: (updated?: R, message?: string) => void; removed: (message?: string) => void;
};

export type ActionDef<R> = {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Nút chính trên header (ví dụ Ghi nhận hiệu chuẩn, Duyệt). */
  primary?: boolean;
  visible?: (record: R) => boolean;
  /** Màn hình thao tác thay thân panel. */
  screen?: (ctx: ActionCtx<R>) => ReactNode;
  /** Thao tác chạy ngay (ví dụ Ẩn / Hiện lại). */
  run?: (record: R) => Promise<R | void>;
  /** Thao tác mở chỗ khác (ví dụ form thêm thiết bị con). */
  onClick?: (record: R) => void;
  /** Màu đỏ, nằm cuối danh sách Thao tác (ví dụ màn hình Xóa riêng của module). */
  danger?: boolean;
  runMessage?: string;
};

export type Heading = { title: string; tags?: ReactNode; subtitle?: ReactNode; meta?: ReactNode };

type Mode = { kind: 'view' } | { kind: 'edit' } | { kind: 'create' } | { kind: 'action'; key: string } | { kind: 'delete' };

export type RecordDetailProps<R extends { id: string } & Audit> = {
  layout: PanelLayout;
  record: R | null;
  creating?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  heading: (record: R) => Heading;
  /** Tiêu đề form thêm mới (module có thêm mới). */
  createTitle?: string;
  sections: SectionDef<R>[];
  extraTabs?: { key: string; label: string; render: (record: R) => ReactNode }[];
  historyUrl?: (record: R) => string;
  historyFilter?: { label: string; param: string };
  /** Nhãn trường cho tab Lịch sử (ngoài các trường đã khai báo). */
  historyLabels?: Record<string, string>;
  canEdit: boolean;
  defaults?: Draft;
  validate?: (draft: Draft, record: R | null) => Record<string, string>;
  onSave: (payload: Draft, record: R | null) => Promise<{ row: R; message?: string }>;
  actions?: ActionDef<R>[];
  canDelete?: boolean;
  /** Nhãn mục xóa trong [⋯] (mặc định "Xóa"). */
  deleteLabel?: string;
  onDelete?: (record: R) => Promise<void>;
  deleteWarning?: (record: R) => string;
  nav?: { onPrev?: () => void; onNext?: () => void };
  onClose?: () => void;
  onExpand?: () => void;
  onSaved: (record: R, created: boolean) => void;
  onDeleted?: (record: R) => void;
  /** Workspace hỏi trước khi rời bản ghi đang sửa. */
  leaveRef?: MutableRefObject<((proceed: () => void) => void) | null>;
};

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function RecordDetail<R extends { id: string } & Audit>(props: RecordDetailProps<R>) {
  const {
    layout, record, creating, loading, error, onRetry, heading, createTitle, sections, extraTabs, historyUrl,
    historyFilter, historyLabels, canEdit, defaults, validate, onSave, actions = [], canDelete, deleteLabel, onDelete, deleteWarning,
    nav, onClose, onExpand, onSaved, onDeleted, leaveRef,
  } = props;
  const { t } = useTranslation();
  const phone = usePhone();
  const [mode, setMode] = useState<Mode>(creating ? { kind: 'create' } : { kind: 'view' });
  const [tab, setTab] = useState('info');
  const [draft, setDraft] = useState<Draft>({});
  const [initial, setInitial] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Thao tác chạy ngay (ActionDef.run) đang gửi — khóa nút Thao tác, chống bấm lặp. */
  const [running, setRunning] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState<(() => void) | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const editing = mode.kind === 'edit' || mode.kind === 'create';
  const fields = useMemo(() => sections.flatMap((s) => s.fields ?? []), [sections]);
  const inUse = (f: FieldDef<R>) => !f.when || (editing && f.when(draft, record));
  const editableFields = fields.filter((f) => !f.readOnly && !(mode.kind === 'edit' && f.createOnly) && !(mode.kind === 'create' && f.hideInCreate) && inUse(f));
  const dirty = editing && editableFields.some((f) => !same(draft[f.key], initial[f.key]));

  // Đổi bản ghi / mở thêm mới → về chế độ ban đầu.
  useEffect(() => {
    setTab('info');
    setErrors({});
    setFormError(null);
    setLeavePrompt(null);
    if (creating) {
      const start: Draft = { ...(defaults ?? {}) };
      setDraft(start);
      setInitial(start);
      setMode({ kind: 'create' });
    } else {
      setMode({ kind: 'view' });
    }
    // Phần cuộn là .dp-body (khung của DetailPanel), không phải nội dung bên trong.
    const scroller = bodyRef.current?.closest('.dp-body');
    if (scroller) scroller.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, creating]);

  function startEdit() {
    if (!record) return;
    const start: Draft = {};
    fields.forEach((f) => { if (!f.createOnly && !f.readOnly) start[f.key] = (record as Record<string, unknown>)[f.key] ?? null; });
    setDraft(start);
    setInitial(start);
    setErrors({});
    setFormError(null);
    setTab('info');
    setMode({ kind: 'edit' });
  }

  function backToView() {
    setErrors({});
    setFormError(null);
    setLeavePrompt(null);
    if (mode.kind === 'create') onClose?.();
    else setMode({ kind: 'view' });
  }

  /** Rời chế độ sửa: có thay đổi thì hỏi trước (footer). */
  function guard(proceed: () => void) {
    if (dirty) setLeavePrompt(() => proceed);
    else proceed();
  }

  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = dirty ? (proceed) => setLeavePrompt(() => proceed) : null;
    return () => { leaveRef.current = null; };
  }, [dirty, leaveRef]);

  // Esc: xem → đóng; sửa / thao tác → hủy.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="listbox"], .dp-more-list')) return;
      e.preventDefault();
      if (mode.kind === 'view') onClose?.();
      else if (mode.kind === 'edit' || mode.kind === 'create') guard(backToView);
      else setMode({ kind: 'view' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function requiredOf(f: FieldDef<R>) {
    return typeof f.required === 'function' ? f.required(draft) : !!f.required;
  }

  async function save(after?: () => void) {
    const nextErrors: Record<string, string> = {};
    editableFields.forEach((f) => {
      if (f.lock?.(record, draft)) return;
      if (requiredOf(f) && isEmpty(draft[f.key])) nextErrors[f.key] = t('dp.required');
    });
    Object.assign(nextErrors, validate?.(draft, record) ?? {});
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setFormError(t('dp.fixErrors')); return; }

    const payload: Draft = {};
    editableFields.forEach((f) => {
      if (f.lock?.(record, draft)) return;
      const value = draft[f.key];
      const normalized = typeof value === 'string' && f.kind !== 'password' ? (value.trim() === '' ? null : value.trim()) : value;
      if (mode.kind === 'create' ? !isEmpty(normalized) || f.kind === 'boolean' || f.kind === 'number' : !same(normalized, initial[f.key])) {
        payload[f.key] = normalized === undefined ? null : normalized;
      }
    });

    setSaving(true);
    setFormError(null);
    try {
      const { row, message } = await onSave(payload, mode.kind === 'create' ? null : record);
      toast.success(message ?? t('dp.saved'));
      const created = mode.kind === 'create';
      setMode({ kind: 'view' });
      setLeavePrompt(null);
      onSaved(row, created);
      after?.();
    } catch (e) {
      if (e instanceof ApiError) {
        const mapped: Record<string, string> = {};
        Object.entries(e.fieldErrors).forEach(([k, v]) => { mapped[k] = t(`dp.fieldError.${v}`, { defaultValue: v }); });
        setErrors(mapped);
      }
      setFormError(errorMessage(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!record || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(record);
      toast.success(t('dp.deleted'));
      onDeleted?.(record);
    } catch (e) {
      setFormError(errorMessage(e, t));
      setMode({ kind: 'view' });
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: ActionDef<R>) {
    if (!record || !action.run || running) return;
    setRunning(true);
    try {
      const updated = await action.run(record);
      toast.success(action.runMessage ?? t('dp.saved'));
      if (updated) onSaved(updated, false);
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setRunning(false);
    }
  }

  function trigger(action: ActionDef<R>) {
    if (action.screen) setMode({ kind: 'action', key: action.key });
    else if (action.onClick && record) action.onClick(record);
    else void runAction(action);
  }

  // ------------------------------------------------------------ Đang tải / lỗi
  if (!creating && (loading || error || !record)) {
    return (
      <DetailPanel layout={layout} title={record ? heading(record).title : <Skeleton className="h-5" style={{ width: 160 }} />}
        nav={nav} onClose={onClose}>
        {error ? <ErrorState message={error} onRetry={onRetry} /> : (
          <div className="dp-skeleton">
            {[0, 1, 2].map((i) => (
              <div key={i} className="dp-section">
                <Skeleton className="h-3" style={{ width: 90 }} />
                <div className="dp-grid">{[0, 1, 2, 3].map((j) => <Skeleton key={j} className="h-8" />)}</div>
              </div>
            ))}
          </div>
        )}
      </DetailPanel>
    );
  }

  const visibleActions = record ? actions.filter((a) => !a.visible || a.visible(record)) : [];
  const primary = canEdit ? visibleActions.filter((a) => a.primary) : [];
  const moreItems: MoreItem[] = mode.kind === 'view' && record ? [
    ...(canEdit ? visibleActions.filter((a) => !a.primary).map((a) => ({
      key: a.key, label: a.label, icon: a.icon, danger: a.danger,
      onClick: () => trigger(a),
    })) : []),
    ...(canDelete && onDelete ? [{ key: 'delete', label: deleteLabel ?? t('common.delete'), icon: <Trash2 size={14} aria-hidden="true" />, danger: true, onClick: () => setMode({ kind: 'delete' }) }] : []),
  ] : [];

  const head = record && mode.kind !== 'create' ? heading(record) : { title: createTitle ?? '' } as Heading;
  const tabs = mode.kind === 'view' && record ? [
    { key: 'info', label: t('dp.tabInfo') },
    ...(extraTabs ?? []).map((x) => ({ key: x.key, label: x.label })),
    ...(historyUrl ? [{ key: 'history', label: t('dp.tabHistory') }] : []),
  ] : undefined;

  const fieldLabel = (key: string) =>
    historyLabels?.[key] ?? fields.find((f) => f.key === key || f.key === `${key}_id`)?.label ?? t(`fields.${key}`, { defaultValue: key });

  // ---------------------------------------------------------------- Footer
  let footer: ReactNode = null;
  if (leavePrompt) {
    footer = (
      <div className="dp-footer-row" data-tone="warn">
        <span className="dp-footer-msg">{t('dp.unsaved')}</span>
        <Button size="sm" onClick={() => setLeavePrompt(null)}>{t('dp.stay')}</Button>
        <Button size="sm" onClick={() => { const go = leavePrompt; setLeavePrompt(null); setMode({ kind: 'view' }); go(); }}>{t('dp.discard')}</Button>
        <Button size="sm" variant="primary" loading={saving} onClick={() => { const go = leavePrompt; void save(go); }}>{t('common.save')}</Button>
      </div>
    );
  } else if (mode.kind === 'delete' && record) {
    footer = (
      <div className="dp-footer-row" data-tone="alert">
        <span className="dp-footer-msg">{deleteWarning?.(record) ?? t('dp.confirmDelete', { name: head.title })}</span>
        <Button size="sm" onClick={() => setMode({ kind: 'view' })} disabled={saving}>{t('common.cancel')}</Button>
        <Button size="sm" variant="danger" loading={saving} onClick={confirmDelete}>{deleteLabel ?? t('common.delete')}</Button>
      </div>
    );
  } else if (editing) {
    footer = (
      <div className="dp-footer-row">
        {dirty && <span className="dp-footer-msg">{t('dp.unsavedShort')}</span>}
        {dirty && mode.kind === 'edit' && <Button size="sm" onClick={() => { setDraft(initial); setErrors({}); }}>{t('dp.undo')}</Button>}
        <Button size="sm" onClick={() => guard(backToView)} disabled={saving}>{t('common.cancel')}</Button>
        <Button size="sm" variant="primary" loading={saving} disabled={mode.kind === 'edit' && !dirty} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    );
  }

  // Điện thoại, khi xem: nút chính + Sửa + Thao tác ▾ ở đáy (vùng ngón cái); ‹ › nằm ở header.
  // Nút chính thứ hai trở đi (ví dụ Từ chối) không có chỗ ở thanh đáy → vào menu Thao tác.
  const phoneMore: MoreItem[] = [
    ...primary.slice(1).map((a) => ({ key: a.key, label: a.label, icon: a.icon, danger: a.danger, onClick: () => trigger(a) })),
    ...moreItems,
  ];
  const mobileBar = phone && mode.kind === 'view' && record && (canEdit || phoneMore.length > 0) ? (
    <div className="dp-mobilebar-row">
      <div className="dp-mobilebar-actions">
        {primary[0] && (
          <Button variant="primary" onClick={() => trigger(primary[0]!)}>{primary[0].icon}{primary[0].label}</Button>
        )}
        {canEdit && (
          <Button variant={primary[0] ? 'quiet' : 'primary'} onClick={startEdit}>
            <Pencil size={14} aria-hidden="true" />{t('common.edit')}
          </Button>
        )}
      </div>
      {phoneMore.length > 0 && <ActionMenu items={phoneMore} busy={running} />}
    </div>
  ) : undefined;

  const headerActions = mode.kind === 'view' && record ? (
    <>
      {primary.map((a) => (
        <Button key={a.key} size="sm" variant="primary" className="dp-primary" onClick={() => trigger(a)}>
          {a.icon}{a.label}
        </Button>
      ))}
      {canEdit && <Button size="sm" className="dp-edit" onClick={startEdit}><Pencil size={14} aria-hidden="true" />{t('common.edit')}</Button>}
    </>
  ) : null;

  // ------------------------------------------------------------------ Thân
  let body: ReactNode;
  const action = mode.kind === 'action' ? visibleActions.find((a) => a.key === mode.key) : undefined;
  if (action?.screen && record) {
    body = action.screen({
      record,
      cancel: () => setMode({ kind: 'view' }),
      done: (updated, message) => {
        toast.success(message ?? t('dp.saved'));
        setMode({ kind: 'view' });
        if (updated) onSaved(updated, false);
      },
      removed: (message) => {
        toast.success(message ?? t('dp.deleted'));
        setMode({ kind: 'view' });
        onDeleted?.(record);
      },
    });
  } else if (tab !== 'info' && record && mode.kind === 'view') {
    const extra = extraTabs?.find((x) => x.key === tab);
    body = extra ? extra.render(record)
      : historyUrl ? <DetailHistory url={historyUrl(record)} fieldLabel={fieldLabel} filter={historyFilter} /> : null;
  } else {
    body = (
      <>
        {formError && <Notice tone="alert">{formError}</Notice>}
        {sections.map((section) => {
          if (mode.kind === 'create' && section.hideInCreate) return null;
          if (section.render) {
            if (!record || mode.kind === 'create') return null;
            const content = section.render(record);
            return content ? <DetailSection key={section.key} title={section.title}>{content}</DetailSection> : null;
          }
          const sectionFields = (section.fields ?? []).filter((f) =>
            !(mode.kind === 'create' && f.hideInCreate) && !(mode.kind !== 'create' && f.createOnly) && inUse(f));
          if (sectionFields.length === 0) return null;
          return (
            <DetailSection key={section.key} title={section.title}>
              {sectionFields.map((f) => editing && !f.readOnly
                ? <FieldEditor key={f.key} field={f} record={record} draft={draft} required={requiredOf(f)} error={errors[f.key]}
                    onChange={(v) => { setDraft((d) => ({ ...d, [f.key]: v })); setErrors((er) => { const n = { ...er }; delete n[f.key]; return n; }); }} />
                : <FieldView key={f.key} field={f} record={record} draft={draft} editing={editing} />)}
            </DetailSection>
          );
        })}
        {record && mode.kind !== 'create' && (
          <DetailSection title={t('dp.systemInfo')}>
            <DetailValue label={t('fields.created_by')}>{record.created_by_name}</DetailValue>
            <DetailValue label={t('fields.created_at')}>{formatTime(record.created_at)}</DetailValue>
            <DetailValue label={t('fields.updated_by')}>{record.updated_by_name}</DetailValue>
            <DetailValue label={t('fields.updated_at')}>{formatTime(record.updated_at)}</DetailValue>
          </DetailSection>
        )}
      </>
    );
  }

  return (
    <DetailPanel
      layout={layout} title={head.title} tags={mode.kind === 'create' ? undefined : head.tags}
      subtitle={mode.kind === 'create' ? undefined : head.subtitle} meta={mode.kind === 'view' ? head.meta : undefined}
      nav={mode.kind === 'create' ? undefined : { onPrev: nav?.onPrev && (() => guard(nav.onPrev!)), onNext: nav?.onNext && (() => guard(nav.onNext!)) }}
      actions={headerActions} more={phone ? undefined : moreItems} moreBusy={running}
      onExpand={mode.kind === 'view' ? onExpand : undefined}
      onClose={onClose && (() => guard(onClose))}
      tabs={tabs} activeTab={tab} onTab={setTab}
      footer={footer} mobileBar={mobileBar}
    >
      <div ref={bodyRef} className="dp-body-inner" data-mode={mode.kind}>{body}</div>
    </DetailPanel>
  );
}

function optionsOf<R>(f: FieldDef<R>, draft: Draft, record: R | null): SelectOption[] {
  return typeof f.options === 'function' ? f.options(draft, record) : f.options ?? [];
}

function FieldView<R>({ field, record, draft, editing }: { field: FieldDef<R>; record: R | null; draft: Draft; editing: boolean }) {
  const { t } = useTranslation();
  let content: ReactNode;
  if (editing && field.draftView) content = field.draftView(draft);
  else if (field.view && record) content = field.view(record);
  else {
    const raw = editing && !field.readOnly && field.key in draft
      ? draft[field.key]
      : record ? (record as Record<string, unknown>)[field.key] : null;
    if (field.kind === 'select' || field.kind === 'radio') {
      const opt = optionsOf(field, draft, record).find((o) => o.value === raw);
      content = opt ? field.optionView?.(opt) ?? opt.label : null;
    }
    else if (field.kind === 'boolean') content = raw === null || raw === undefined ? null : raw ? t('common.yes') : t('common.no');
    else if (field.kind === 'checkboxes' && Array.isArray(raw)) {
      const opts = optionsOf(field, draft, record);
      content = raw.map((v) => opts.find((o) => o.value === v)?.label ?? String(v)).join(', ');
    } else content = raw === null || raw === undefined ? null : String(raw);
  }
  const lockReason = editing ? field.lock?.(record, draft) : null;
  return <DetailValue label={field.label} wide={field.wide} hint={lockReason ?? field.hint}>{content}</DetailValue>;
}

function FieldEditor<R>({ field, record, draft, required, error, onChange }: {
  field: FieldDef<R>; record: R | null; draft: Draft; required: boolean; error?: string; onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const lockReason = field.lock?.(record, draft);
  if (lockReason) return <FieldView field={field} record={record} draft={draft} editing />;
  const value = draft[field.key];
  const id = `f-${field.key}`;
  const kind = field.kind ?? 'text';
  let input: ReactNode;
  if (kind === 'select') {
    input = (
      <SearchableSelect value={(value as string | null) ?? ''} onChange={(v) => onChange(v || null)}
        options={optionsOf(field, draft, record)} clearable={!required} placeholder={t('dp.selectPlaceholder')} ariaLabel={field.label} />
    );
  } else if (kind === 'radio') {
    input = (
      <div className="dp-radios" role="radiogroup" aria-label={field.label}>
        {optionsOf(field, draft, record).map((o) => (
          <label key={o.value}>
            <input type="radio" name={id} value={o.value} checked={value === o.value} disabled={o.disabled}
              onChange={() => onChange(o.value)} />
            {field.optionView ? field.optionView(o) : o.label}
          </label>
        ))}
      </div>
    );
  } else if (kind === 'textarea') {
    input = <textarea id={id} rows={3} value={(value as string | null) ?? ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === 'checkboxes') {
    const list = Array.isArray(value) ? (value as string[]) : [];
    input = (
      <div className="dp-checks" role="group" aria-label={field.label}>
        {optionsOf(field, draft, record).map((o) => (
          <label key={o.value}>
            <input type="checkbox" checked={list.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((v) => v !== o.value))} />
            {o.label}
          </label>
        ))}
      </div>
    );
  } else if (kind === 'boolean') {
    input = (
      <label className="dp-switch">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {value ? t('common.yes') : t('common.no')}
      </label>
    );
  } else if (kind === 'number') {
    input = (
      <input id={id} type="number" inputMode="numeric" min={field.min} max={field.max}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    );
  } else {
    input = (
      <input id={id} type={kind === 'date' ? 'date' : kind === 'password' ? 'password' : 'text'}
        autoComplete={kind === 'password' ? 'new-password' : 'off'} maxLength={field.maxLength}
        value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <div className="dp-field" data-wide={field.wide || kind === 'textarea' || kind === 'checkboxes' || kind === 'radio' || undefined} data-invalid={!!error || undefined}>
      <label className="dp-label" htmlFor={id}>{field.label}{required && <RequiredMark />}</label>
      <div className="dp-input">{input}</div>
      {error ? <span className="dp-error" role="alert">{error}</span> : (field.editHint ?? field.hint) && <span className="dp-hint">{field.editHint ?? field.hint}</span>}
    </div>
  );
}

/**
 * Khung màn hình thao tác: ← Quay lại · tiêu đề · nội dung · [Hủy] [Xác nhận].
 * Khung lo trạng thái gửi: đang chạy thì khóa màn hình (không bấm lặp, không
 * rời đi giữa chừng); lỗi (kể cả mất mạng) hiện ngay trên màn hình.
 */
export function ActionScreen({ title, description, children, onCancel, onConfirm, confirmLabel, confirmDisabled, danger }: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  /** What the button does ("Swap", "Approve"…); "Confirm" only when nothing more specific fits. */
  confirmLabel?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dp-action">
      <button type="button" className="dp-action-back" onClick={onCancel} disabled={busy}>
        <ArrowLeft size={15} aria-hidden="true" />{t('dp.backToDetail')}
      </button>
      <h3 className="dp-action-title">{title}</h3>
      {description && <p className="dp-action-desc">{description}</p>}
      {error && <Notice tone="alert">{error}</Notice>}
      <div className="dp-action-body">
        {children}
        {busy && children && <LoadingOverlay label={t('common.processing')} />}
      </div>
      <div className="dp-action-footer">
        <Button onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
        {/* With a body the dimmed LoadingOverlay is the one indicator; without one the button itself spins. */}
        <Button variant={danger ? 'danger' : 'primary'} loading={busy && !children} disabled={busy || confirmDisabled} onClick={() => void confirm()}>
          {confirmLabel ?? t('dp.confirm')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Ô nhập ngoài panel (màn hình thao tác, Account settings) — cùng kiểu với ô của panel.
 * `htmlFor`: nhãn thật gắn với ô nhập (bắt buộc cho input / textarea); `wide: false`: nửa hàng.
 */
export function ActionField({ label, required, children, hint, error, htmlFor, wide = true }: {
  label: string; required?: boolean; children: ReactNode; hint?: ReactNode; error?: string; htmlFor?: string; wide?: boolean;
}) {
  const text = <>{label}{required && <RequiredMark />}</>;
  return (
    <div className="dp-field" data-wide={wide || undefined} data-invalid={!!error || undefined}>
      {htmlFor ? <label className="dp-label" htmlFor={htmlFor}>{text}</label> : <span className="dp-label">{text}</span>}
      <div className="dp-input">{children}</div>
      {error ? <span className="dp-error">{error}</span> : hint && <span className="dp-hint">{hint}</span>}
    </div>
  );
}
