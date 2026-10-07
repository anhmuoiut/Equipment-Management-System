'use client';

/**
 * Một danh sách của Configuration (Part Number, Location, …): Masterlist +
 * Detail Panel như mọi module (docs/DETAIL_MODEL.md 4.4). Chỉ Admin.
 * Bảng có is_active: "Xóa" = Ẩn / Hiện lại. Tag (thẻ chọn trong Remark), Hiệu chuẩn › Setup: xóa thật.
 * Part Number: Type bắt buộc — thiết bị mang part number tự lấy Type đó (database).
 * Setup hiệu chuẩn: PN (trong các PN đang có thiết bị) + chu kỳ + status mặc định; thiết bị
 * của PN tự lên Dashboard hiệu chuẩn (database).
 */
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useFetch } from '@/lib/client/useFetch';
import { refreshOptions, toSelect, useOptions } from '@/lib/client/options';
import { toast } from '@/components/ui';
import { configList, STATUS_COLORS } from '@/lib/configuration';
import { StatusTag, ToneTag } from '@/components/ui/tags';
import { RecordDetail, type ActionDef, type SectionDef } from '@/components/ui/detail/RecordDetail';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import type { Column } from '@/components/ui/masterlist/Masterlist';
import type { ConfigList, ConfigRow, StatusColor } from '@/lib/types';

export function ConfigWorkspace({ listKey }: { listKey: ConfigList }) {
  const { t } = useTranslation();
  const def = configList(listKey)!;
  const options = useOptions();
  const list = useList<ConfigRow>(`/api/configuration/${listKey}`);
  const listName = t(`cfg.list.${listKey}`);
  const colorLabel = (c: StatusColor | undefined) => (c ? t(`values.${c}`) : null);
  /** Chip màu: tag trạng thái tô đúng màu, chữ là tên màu. */
  const colorChip = (c: StatusColor | undefined) => (c ? <StatusTag name={colorLabel(c)} color={c} /> : null);

  // Hiệu chuẩn › Setup: part number chọn trong các PN đang có thiết bị, mỗi PN một dòng (bỏ PN đã có, trừ dòng đang xem).
  const equipmentPns = useFetch<string[]>(def.isCalibration ? '/api/equipment/part-numbers' : null);
  const pool = new Set(equipmentPns.data ?? []);
  const taken = new Set(list.rows.map((r) => r.part_number_id));
  const partNumberChoices = (current: string | undefined) => toSelect(
    options?.part_numbers.filter((pn) => pn.id === current || (pool.has(pn.id) && !taken.has(pn.id))),
    current, ` (${t('cfg.hidden')})`);
  const partNumberHint = equipmentPns.loading ? t('common.loadingEllipsis') : equipmentPns.error ?? t('cfg.calibrationPartHint');

  const columns: Column<ConfigRow>[] = def.isCalibration ? [
    { key: 'display_name', label: t('fields.part_number'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    { key: 'interval_months', label: t('fields.interval_months'), value: (r) => r.interval_months ?? null },
    { key: 'warning_days', label: t('fields.warning_days'), value: (r) => r.warning_days ?? null },
  ] : def.isTag ? [
    { key: 'display_name', label: t('fields.display_name'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    { key: 'color', label: t('fields.color'), value: (r) => colorLabel(r.color), render: (r) => colorChip(r.color), filter: true },
    { key: 'sort_order', label: t('fields.sort_order'), value: (r) => r.sort_order },
  ] : [
    { key: 'display_name', label: t('fields.display_name'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    ...(def.hasType ? [
      { key: 'type', label: t('fields.type'), value: (r: ConfigRow) => r.type ?? null, filter: true },
      { key: 'usage_needs_parent', label: t('fields.usage_needs_parent'), value: (r: ConfigRow) => (r.usage_needs_parent ? t('common.yes') : t('common.no')), filter: true },
    ] : []),
    ...(def.hasDescription ? [{ key: 'description', label: t('fields.description'), value: (r: ConfigRow) => r.description ?? null, wrap: true, width: 200 }] : []),
    { key: 'sort_order', label: t('fields.sort_order'), value: (r) => r.sort_order },
    { key: 'is_active', label: t('fields.is_active'), value: (r) => (r.is_active ? t('cfg.active') : t('cfg.hidden')),
      render: (r) => <ToneTag text={r.is_active ? t('cfg.active') : t('cfg.hidden')} tone={r.is_active ? 'ok' : 'neutral'} />, filter: true },
  ];

  const sections: SectionDef<ConfigRow>[] = [{
    key: 'info', title: t('cfg.groupInfo'),
    fields: def.isCalibration ? [
      { key: 'part_number_id', label: t('fields.part_number'), kind: 'select', required: true, view: (r) => r.display_name,
        options: (_d, r) => partNumberChoices(r?.part_number_id), editHint: partNumberHint,
        lock: (r) => (r ? t('cfg.partNumberFixed') : null) },
      { key: 'interval_months', label: t('fields.interval_months'), kind: 'number', required: true, min: 1, max: 600,
        view: (r) => t('cal.months', { count: r.interval_months ?? 0 }) },
      { key: 'warning_days', label: t('fields.warning_days'), kind: 'number', required: true, min: 1, max: 3650,
        hint: t('cfg.warningHint'), view: (r) => t('cal.days', { count: r.warning_days ?? 0 }) },
    ] : def.isTag ? [
      { key: 'display_name', label: t('fields.display_name'), required: true, maxLength: 100 },
      { key: 'sort_order', label: t('fields.sort_order'), kind: 'number', required: true, min: 0 },
      { key: 'color', label: t('fields.color'), kind: 'radio', required: true, hint: t('cfg.colorHint'),
        options: () => STATUS_COLORS.map((c) => ({ value: c, label: t(`values.${c}`) })),
        optionView: (o) => colorChip(o.value as StatusColor), view: (r) => colorChip(r.color) },
    ] : [
      { key: 'display_name', label: t('fields.display_name'), required: true, maxLength: 200 },
      // Part Number → Type: equipment with this part number always gets this Type (the database keeps them in step).
      ...(def.hasType ? [{ key: 'type_id', label: t('fields.type'), kind: 'select' as const, required: true, view: (r: ConfigRow) => r.type,
        options: (_d: unknown, r: ConfigRow | null) => toSelect(options?.types, r?.type_id, ` (${t('cfg.hidden')})`),
        editHint: t('cfg.partTypeHint') },
      // Usage cần cha: thiết bị loại này chỉ In use được khi đã gắn vào thiết bị cha (database, mục 3d).
      { key: 'usage_needs_parent', label: t('fields.usage_needs_parent'), kind: 'boolean' as const, hint: t('cfg.usageNeedsParentHint'),
        view: (r: ConfigRow) => (r.usage_needs_parent ? t('common.yes') : t('common.no')) }] : []),
      ...(def.hasDescription ? [{ key: 'description', label: t('fields.description'), kind: 'textarea' as const, wide: true, maxLength: 1000 }] : []),
      { key: 'sort_order', label: t('fields.sort_order'), kind: 'number', required: true, min: 0 },
      { key: 'is_active', label: t('fields.is_active'), kind: 'boolean', hint: t('cfg.activeHint'),
        view: (r) => <ToneTag text={r.is_active ? t('cfg.active') : t('cfg.hidden')} tone={r.is_active ? 'ok' : 'neutral'} /> },
    ],
  }];

  const defaults = def.isCalibration ? { warning_days: 30 } : def.isTag
    ? { sort_order: 0 }
    : { sort_order: 0, is_active: true, ...(def.hasType ? { usage_needs_parent: false } : {}) };

  // Dữ liệu gốc vừa đổi → mọi form cần danh sách chọn mới. Thay đổi đã lưu; chỉ báo nếu chưa tải lại được.
  const refresh = () => { refreshOptions().catch(() => toast.warning(t('cfg.optionsStale'))); };

  const actions: ActionDef<ConfigRow>[] = def.hideable ? [{
    key: 'toggle', label: t('cfg.hide'), icon: <EyeOff size={14} aria-hidden="true" />, visible: (r) => r.is_active,
    runMessage: t('cfg.hiddenDone'),
    run: async (r) => (await api.put<ConfigRow>(`/api/configuration/${listKey}/${r.id}`, { is_active: false })).data,
  }, {
    key: 'show', label: t('cfg.show'), icon: <Eye size={14} aria-hidden="true" />, visible: (r) => !r.is_active,
    runMessage: t('cfg.shownDone'),
    run: async (r) => (await api.put<ConfigRow>(`/api/configuration/${listKey}/${r.id}`, { is_active: true })).data,
  }] : [];

  return (
    <ModuleWorkspace<ConfigRow>
      title={listName}
      list={list}
      columns={columns}
      storageKey={`configuration-${listKey}`}
      exportName={listKey}
      canAdd
      addLabel={t('ml.add')}
      renderDetail={(ctx) => (
        <RecordDetail<ConfigRow>
          layout="panel"
          record={ctx.row}
          creating={ctx.creating}
          loading={ctx.loading}
          error={ctx.error}
          onRetry={ctx.onRetry}
          createTitle={t('cfg.addTitle', { list: listName })}
          heading={(r) => ({
            title: r.display_name,
            tags: <>
              {def.isTag && <StatusTag name={r.display_name} color={r.color} />}
              {def.hideable && <ToneTag text={r.is_active ? t('cfg.active') : t('cfg.hidden')} tone={r.is_active ? 'ok' : 'neutral'} />}
              <ToneTag text={listName} tone="info" />
            </>,
          })}
          sections={sections}
          defaults={defaults}
          historyUrl={(r) => `/api/configuration/${listKey}/${r.id}/history`}
          historyLabels={{ part_number: t('fields.part_number') }}
          canEdit
          onSave={async (payload, record) => {
            const res = record
              ? await api.put<ConfigRow>(`/api/configuration/${listKey}/${record.id}`, payload)
              : await api.post<ConfigRow>(`/api/configuration/${listKey}`, payload);
            return { row: res.data };
          }}
          actions={actions}
          canDelete={def.deletable}
          deleteWarning={def.isCalibration ? (r) => t('cfg.calibrationDeleteWarning', { name: r.display_name }) : undefined}
          onDelete={async (r) => { await api.delete(`/api/configuration/${listKey}/${r.id}`); refresh(); }}
          nav={ctx.nav}
          onClose={ctx.onClose}
          // Lưu và Ẩn / Hiện đều qua đây — tải lại danh sách chọn một lần.
          onSaved={(row, created) => { refresh(); ctx.onSaved(row, created); }}
          onDeleted={ctx.onDeleted}
          leaveRef={ctx.leaveRef}
        />
      )}
    />
  );
}
