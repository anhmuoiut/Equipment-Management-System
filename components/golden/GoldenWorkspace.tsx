'use client';

/** Trang Golden: Masterlist + Detail Panel. */
import { useTranslation } from 'react-i18next';
import { MapPin, Upload } from 'lucide-react';
import { useCan } from '@/components/ViewerContext';
import { StatusTag } from '@/components/ui/tags';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import { RowCard, type Column } from '@/components/ui/masterlist/Masterlist';
import { GoldenDetail } from './GoldenDetail';
import { GoldenImport } from './GoldenImport';
import type { GoldenRow } from '@/lib/types';

export function GoldenWorkspace() {
  const { t } = useTranslation();
  const can = useCan();
  const list = useList<GoldenRow>('/api/golden');

  const columns: Column<GoldenRow>[] = [
    { key: 'status', label: t('fields.status'), value: (r) => r.status, render: (r) => <StatusTag name={r.status} color={r.status_color} />, filter: true },
    { key: 'part_number', label: t('fields.part_number'), value: (r) => r.part_number, filter: true },
    { key: 'serial_number', label: t('fields.serial_number'), value: (r) => r.serial_number, render: (r) => <strong>{r.serial_number}</strong> },
    { key: 'utd_part_number', label: t('fields.utd_part_number'), value: (r) => r.utd_part_number },
    { key: 'location', label: t('fields.location'), value: (r) => r.location, filter: true },
    { key: 'origin', label: t('fields.origin'), value: (r) => r.origin, filter: true },
    { key: 'purpose', label: t('fields.purpose'), value: (r) => r.purpose, wrap: true, width: 160 },
    { key: 'remark', label: t('fields.remark'), value: (r) => r.remark, wrap: true, width: 180 },
  ];

  return (
    <ModuleWorkspace<GoldenRow>
      title={t('nav.golden')}
      list={list}
      columns={columns}
      mobileCard={(r) => (
        <RowCard
          title={r.serial_number}
          tag={<StatusTag name={r.status} color={r.status_color} />}
          lines={[
            <><MapPin size={13} aria-hidden="true" /><span className="rc-place">{r.location ?? '—'}</span>{[r.part_number, r.utd_part_number].filter(Boolean).map((x) => ` · ${x}`)}</>,
            r.purpose,
          ]}
        />
      )}
      storageKey="golden"
      exportName="golden-samples"
      canAdd={can.edit}
      addLabel={t('gs.add')}
      tools={can.edit ? [{
        key: 'import', label: t('imp.button'), icon: <Upload size={14} aria-hidden="true" />,
        render: ({ onClose }) => <GoldenImport onClose={onClose} onImported={list.reload} />,
      }] : undefined}
      detailPath={(id) => `/golden/${id}`}
      renderDetail={(ctx) => <GoldenDetail ctx={ctx} layout="panel" />}
    />
  );
}
