'use client';

/** Chi tiết golden sample (docs/DETAIL_MODEL.md 4.3). */
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { api, formatRelativeTime } from '@/lib/client/api';
import { statusRequiresRemark, statusSelect, toSelect, useOptions } from '@/lib/client/options';
import { useCan } from '@/components/ViewerContext';
import { StatusTag } from '@/components/ui/tags';
import { RecordDetail, type SectionDef } from '@/components/ui/detail/RecordDetail';
import type { PanelLayout } from '@/components/ui/detail/DetailPanel';
import type { DetailCtx } from '@/components/ui/workspace/ModuleWorkspace';
import type { GoldenRow } from '@/lib/types';

export function GoldenDetail({ ctx, layout }: { ctx: DetailCtx<GoldenRow>; layout: PanelLayout }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const options = useOptions();
  const can = useCan();
  const hidden = ` (${t('cfg.hidden')})`;

  const sections: SectionDef<GoldenRow>[] = [
    {
      key: 'identity', title: t('eq.groupIdentity'), fields: [
        { key: 'part_number', label: t('fields.part_number'), required: true, maxLength: 200 },
        { key: 'serial_number', label: t('fields.serial_number'), required: true, maxLength: 200 },
        { key: 'utd_part_number', label: t('fields.utd_part_number'), maxLength: 200 },
      ],
    },
    {
      key: 'place', title: t('gs.groupPlace'), fields: [
        { key: 'location_id', label: t('fields.location'), kind: 'select', required: true, view: (r) => r.location,
          options: (_d, r) => toSelect(options?.locations, r?.location_id, hidden) },
        { key: 'status_id', label: t('fields.status'), kind: 'select', view: (r) => <StatusTag name={r.status} color={r.status_color} />,
          options: () => statusSelect(options?.statuses), required: true },
      ],
    },
    {
      key: 'more', title: t('gs.groupMore'), fields: [
        { key: 'origin', label: t('fields.origin'), maxLength: 200 },
        { key: 'purpose', label: t('fields.purpose'), maxLength: 500 },
      ],
    },
    {
      key: 'notes', title: t('eq.groupNotes'), fields: [
        { key: 'remark', label: t('fields.remark'), kind: 'textarea', wide: true, maxLength: 1000,
          required: (d) => statusRequiresRemark(options?.statuses, d.status_id) },
      ],
    },
  ];

  return (
    <RecordDetail<GoldenRow>
      layout={layout}
      record={ctx.row}
      creating={ctx.creating}
      loading={ctx.loading}
      error={ctx.error}
      onRetry={ctx.onRetry}
      createTitle={t('gs.addTitle')}
      heading={(r) => ({
        title: r.serial_number,
        tags: <StatusTag name={r.status} color={r.status_color} />,
        subtitle: r.part_number,
        meta: (
          <>
            {r.location && <span data-primary><MapPin size={12} aria-hidden="true" /> {r.location}</span>}
            <span>{t('dp.updated', { when: formatRelativeTime(r.updated_at, language), who: r.updated_by_name ?? '—' })}</span>
          </>
        ),
      })}
      sections={sections}
      historyUrl={(r) => `/api/golden/${r.id}/history`}
      canEdit={can.edit}
      onSave={async (payload, record) => {
        const res = record
          ? await api.put<GoldenRow>(`/api/golden/${record.id}`, payload)
          : await api.post<GoldenRow>('/api/golden', payload);
        return { row: res.data, message: res.meta.duplicate ? t('eq.duplicateSerial') : undefined };
      }}
      canDelete={can.remove}
      onDelete={async (r) => { await api.delete(`/api/golden/${r.id}`); }}
      nav={ctx.nav}
      onClose={ctx.onClose}
      onExpand={ctx.onExpand}
      onSaved={ctx.onSaved}
      onDeleted={ctx.onDeleted}
      leaveRef={ctx.leaveRef}
    />
  );
}
