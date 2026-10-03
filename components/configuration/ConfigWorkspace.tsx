'use client';

/**
 * Một danh sách của Configuration (Part Number, Location, …): Masterlist +
 * Detail Panel như mọi module (docs/DETAIL_MODEL.md 4.4). Chỉ Admin.
 * Bảng có is_active: "Xóa" = Ẩn / Hiện lại. Status, Calibration Interval: xóa thật.
 */
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/client/api';
import { refreshOptions, toSelect, useOptions } from '@/lib/client/options';
import { configList, STATUS_COLORS } from '@/lib/configuration';
import { StatusTag, ToneTag } from '@/components/ui/tags';
import { RecordDetail, type ActionDef, type SectionDef } from '@/components/ui/detail/RecordDetail';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import type { Column } from '@/components/ui/masterlist/Masterlist';
import type { ConfigList, ConfigRow, StatusColor, StatusPage } from '@/lib/types';

const PAGES: StatusPage[] = ['equipment', 'calibration', 'golden_sample'];

export function ConfigWorkspace({ listKey }: { listKey: ConfigList }) {
  const { t } = useTranslation();
  const def = configList(listKey)!;
  const options = useOptions();
  const list = useList<ConfigRow>(`/api/configuration/${listKey}`);
  const listName = t(`cfg.list.${listKey}`);
  const pageLabel = (p: StatusPage) => t(`values.${p}`);
  const colorLabel = (c: StatusColor | undefined) => (c ? t(`values.${c}`) : null);
  /** Chip màu: tag trạng thái tô đúng màu, chữ là tên màu. */
  const colorChip = (c: StatusColor | undefined) => (c ? <StatusTag name={colorLabel(c)} color={c} /> : null);

  const columns: Column<ConfigRow>[] = def.isInterval ? [
    { key: 'display_name', label: t('fields.part_number'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    { key: 'interval_months', label: t('fields.interval_months'), value: (r) => r.interval_months ?? null },
    { key: 'warning_days', label: t('fields.warning_days'), value: (r) => r.warning_days ?? null },
  ] : def.isStatus ? [
    { key: 'display_name', label: t('fields.display_name'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    { key: 'applies_to', label: t('fields.applies_to'), value: (r) => (r.applies_to ?? []).map(pageLabel).join(', ') },
    { key: 'requires_remark', label: t('fields.requires_remark'), value: (r) => (r.requires_remark ? t('common.yes') : t('common.no')), filter: true },
    { key: 'color', label: t('fields.color'), value: (r) => colorLabel(r.color), render: (r) => colorChip(r.color), filter: true },
    { key: 'sort_order', label: t('fields.sort_order'), value: (r) => r.sort_order },
  ] : [
    { key: 'display_name', label: t('fields.display_name'), value: (r) => r.display_name, render: (r) => <strong>{r.display_name}</strong> },
    ...(def.hasDescription ? [{ key: 'description', label: t('fields.description'), value: (r: ConfigRow) => r.description ?? null, wrap: true, width: 200 }] : []),
    { key: 'sort_order', label: t('fields.sort_order'), value: (r) => r.sort_order },
    { key: 'is_active', label: t('fields.is_active'), value: (r) => (r.is_active ? t('cfg.active') : t('cfg.hidden')),
      render: (r) => <ToneTag text={r.is_active ? t('cfg.active') : t('cfg.hidden')} tone={r.is_active ? 'ok' : 'neutral'} />, filter: true },
  ];

  const sections: SectionDef<ConfigRow>[] = [{
    key: 'info', title: t('cfg.groupInfo'),
    fields: def.isInterval ? [
      { key: 'part_number_id', label: t('fields.part_number'), kind: 'select', required: true, view: (r) => r.display_name,
        options: (_d, r) => toSelect(options?.part_numbers, r?.part_number_id, ` (${t('cfg.hidden')})`) },
      { key: 'interval_months', label: t('fields.interval_months'), kind: 'number', required: true, min: 1, max: 600,
        view: (r) => t('cal.months', { count: r.interval_months ?? 0 }) },
      { key: 'warning_days', label: t('fields.warning_days'), kind: 'number', required: true, min: 1, max: 3650,
        hint: t('cfg.warningHint'), view: (r) => t('cal.days', { count: r.warning_days ?? 0 }) },
    ] : def.isStatus ? [
      { key: 'display_name', label: t('fields.display_name'), required: true, maxLength: 100 },
      { key: 'sort_order', label: t('fields.sort_order'), kind: 'number', required: true, min: 0 },
      { key: 'applies_to', label: t('fields.applies_to'), kind: 'checkboxes', required: true, hint: t('cfg.appliesToHint'),
        options: () => PAGES.map((p) => ({ value: p, label: pageLabel(p) })) },
      { key: 'requires_remark', label: t('fields.requires_remark'), kind: 'boolean' },
      { key: 'color', label: t('fields.color'), kind: 'radio', required: true, hint: t('cfg.colorHint'),
        options: () => STATUS_COLORS.map((c) => ({ value: c, label: t(`values.${c}`) })),
        optionView: (o) => colorChip(o.value as StatusColor), view: (r) => colorChip(r.color) },
    ] : [
      { key: 'display_name', label: t('fields.display_name'), required: true, maxLength: 200 },
      ...(def.hasDescription ? [{ key: 'description', label: t('fields.description'), kind: 'textarea' as const, wide: true, maxLength: 1000 }] : []),
      { key: 'sort_order', label: t('fields.sort_order'), kind: 'number', required: true, min: 0 },
      { key: 'is_active', label: t('fields.is_active'), kind: 'boolean', hint: t('cfg.activeHint'),
        view: (r) => <ToneTag text={r.is_active ? t('cfg.active') : t('cfg.hidden')} tone={r.is_active ? 'ok' : 'neutral'} /> },
    ],
  }];

  const defaults = def.isInterval ? { warning_days: 30 } : def.isStatus
    ? { sort_order: 0, applies_to: ['equipment'], requires_remark: false }
    : { sort_order: 0, is_active: true };

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
          icon={<SlidersHorizontal size={18} />}
          createTitle={t('cfg.addTitle', { list: listName })}
          heading={(r) => ({
            title: r.display_name,
            tags: <>
              {def.isStatus && <StatusTag name={r.display_name} color={r.color} />}
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
            refreshOptions();
            return { row: res.data };
          }}
          actions={actions}
          canDelete={def.deletable}
          onDelete={async (r) => { await api.delete(`/api/configuration/${listKey}/${r.id}`); refreshOptions(); }}
          nav={ctx.nav}
          onClose={ctx.onClose}
          onSaved={(row, created) => { refreshOptions(); ctx.onSaved(row, created); }}
          onDeleted={ctx.onDeleted}
          leaveRef={ctx.leaveRef}
        />
      )}
    />
  );
}
