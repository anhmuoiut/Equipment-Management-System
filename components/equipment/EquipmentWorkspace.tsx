'use client';

/** Trang Equipment: Masterlist + Detail Panel; điện thoại hiện mỗi thiết bị một thẻ (serial, trạng thái, vị trí). */
import { useTranslation } from 'react-i18next';
import { CornerDownRight, ListTree, LogIn, LogOut, MapPin, Upload } from 'lucide-react';
import { useCan } from '@/components/ViewerContext';
import { RemarkCell, UsageTag } from '@/components/ui/tags';
import { ModuleWorkspace, useList } from '@/components/ui/workspace/ModuleWorkspace';
import { RowCard, type Column } from '@/components/ui/masterlist/Masterlist';
import type { SectionDef } from '@/components/ui/detail/RecordDetail';
import { EquipmentDetail } from './EquipmentDetail';
import { EquipmentImport } from './EquipmentImport';
import { UsageTool } from './EquipmentUsage';
import type { EquipmentRow } from '@/lib/types';

export function EquipmentWorkspace({ extensions }: { extensions?: SectionDef<EquipmentRow>[] }) {
  const { t } = useTranslation();
  const can = useCan();
  const list = useList<EquipmentRow>('/api/equipment');

  // Usage, then what it is (serial, part number), where it is (location), then the rest (Status sits next to
  // Remark): with the Detail Panel open only the first few columns are visible, and those must identify the equipment.
  const columns: Column<EquipmentRow>[] = [
    { key: 'usage', label: t('fields.usage'), value: (r) => t(`values.${r.usage}`), render: (r) => <UsageTag usage={r.usage} />, filter: true },
    { key: 'serial_number', label: t('fields.serial_number'), value: (r) => r.serial_number, render: (r) => <strong>{r.serial_number}</strong> },
    { key: 'part_number', label: t('fields.part_number'), value: (r) => r.part_number, filter: true },
    { key: 'location', label: t('fields.location'), value: (r) => r.location, filter: true },
    { key: 'type', label: t('fields.type'), value: (r) => r.type, filter: true },
    { key: 'jabil_id', label: t('fields.jabil_id'), value: (r) => r.jabil_id },
    { key: 'asset', label: t('fields.asset'), value: (r) => r.asset },
    { key: 'level', label: t('fields.level'), value: (r) => r.level, filter: true },
    { key: 'parent', label: t('fields.parent'), value: (r) => r.parent_serial, filter: true },
    { key: 'remark', label: t('fields.remark'), value: (r) => [...r.tags.map((x) => x.display_name), r.remark ?? ''].join(' ').trim() || null,
      render: (r) => <RemarkCell tags={r.tags} remark={r.remark} />, wrap: true, width: 200 },
  ];

  /** Có con / là con của thiết bị khác — dùng ở cột đầu của bảng và trên thẻ. */
  const relation = (r: EquipmentRow) => (r.has_children
    ? <span className="rel" title={t('eq.hasChildren')}><ListTree size={14} aria-label={t('eq.hasChildren')} /></span>
    : r.parent_id ? <span className="rel" title={t('eq.isChild', { serial: r.parent_serial })}><CornerDownRight size={14} aria-label={t('eq.isChild', { serial: r.parent_serial })} /></span>
      : null);

  return (
    <ModuleWorkspace<EquipmentRow>
      title={t('nav.equipment')}
      list={list}
      columns={columns}
      mobileCard={(r) => (
        <RowCard
          title={<>{r.serial_number}{relation(r)}</>}
          tag={<UsageTag usage={r.usage} />}
          lines={[
            <><MapPin size={13} aria-hidden="true" /><span className="rc-place">{r.location ?? '—'}</span>{[r.part_number, r.type, r.jabil_id].filter(Boolean).map((x) => ` · ${x}`)}</>,
          ]}
        />
      )}
      storageKey="equipment"
      defaultColumns={['usage', 'serial_number', 'part_number', 'type', 'location', 'jabil_id', 'asset', 'level']}
      exportName="equipment"
      canAdd={can.edit}
      addLabel={t('eq.add')}
      tools={can.edit ? [{
        key: 'checkout', label: t('eq.checkOut'), icon: <LogOut size={14} aria-hidden="true" />,
        render: ({ onClose }) => <UsageTool mode="checkout" rows={list.rows} onClose={onClose} onDone={list.reload} />,
      }, {
        key: 'checkin', label: t('eq.checkIn'), icon: <LogIn size={14} aria-hidden="true" />,
        render: ({ onClose }) => <UsageTool mode="checkin" rows={list.rows} onClose={onClose} onDone={list.reload} />,
      }, {
        key: 'import', label: t('imp.button'), icon: <Upload size={14} aria-hidden="true" />,
        render: ({ onClose }) => <EquipmentImport onClose={onClose} onImported={list.reload} />,
      }] : undefined}
      detailPath={(id) => `/equipment/${id}`}
      leading={{
        label: t('eq.relation'),
        header: <ListTree size={14} aria-hidden="true" />,
        render: relation,
      }}
      renderDetail={(ctx) => <EquipmentDetail ctx={ctx} layout="panel" extensions={extensions} rows={list.rows} />}
    />
  );
}
