'use client';

/**
 * Chi tiết thiết bị (docs/DETAIL_MODEL.md 4.1). Module khác gắn nhóm chỉ đọc
 * qua `extensions` (ví dụ nhóm Hiệu chuẩn) — Equipment không đọc bảng của họ.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Cpu, GitBranch, Link2, MapPin, Plus, Trash2, Unlink } from 'lucide-react';
import { api, formatRelativeTime } from '@/lib/client/api';
import { useFetch } from '@/lib/client/useFetch';
import { statusRequiresRemark, statusSelect, toSelect, useOptions } from '@/lib/client/options';
import { useCan } from '@/components/ViewerContext';
import { StatusTag } from '@/components/ui/tags';
import { RecordDetail, type ActionDef, type Draft, type SectionDef } from '@/components/ui/detail/RecordDetail';
import type { PanelLayout } from '@/components/ui/detail/DetailPanel';
import type { DetailCtx } from '@/components/ui/workspace/ModuleWorkspace';
import { EquipmentTree } from './EquipmentTree';
import { ChangeLocationScreen, DeleteScreen, DetachScreen, MoveScreen, SwapScreen, equipmentFamily } from './EquipmentActions';
import type { EquipmentRow } from '@/lib/types';

/** Thiết bị cha / con trong nhóm Vị trí & quan hệ: SN · PN, bấm để mở. */
function EquipmentChip({ serial, part, onOpen }: { serial: string; part?: string | null; onOpen: () => void }) {
  return (
    <button type="button" className="eq-chip" onClick={onOpen}>
      <span className="eq-chip-serial">{serial}</span>
      {part && <span className="eq-chip-part">{part}</span>}
    </button>
  );
}

/**
 * Tất cả thiết bị — để chọn thiết bị cha và liệt kê thiết bị con. Workspace
 * truyền danh sách đang có (luôn mới sau khi lưu); trang riêng tự tải, và tải
 * lại sau mỗi lần lưu (`savedAt` đổi → URL đổi; API bỏ qua tham số này).
 */
function useAllEquipment(given: EquipmentRow[] | undefined, savedAt: string | undefined) {
  const own = useFetch<EquipmentRow[]>(given ? null : `/api/equipment?saved=${encodeURIComponent(savedAt ?? '')}`);
  return { all: given ?? own.data, allError: given ? null : own.error };
}

export function EquipmentDetail({ ctx, layout, extensions = [], rows }: {
  ctx: DetailCtx<EquipmentRow>;
  layout: PanelLayout;
  extensions?: SectionDef<EquipmentRow>[];
  /** Danh sách thiết bị của masterlist (nếu có). */
  rows?: EquipmentRow[];
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'vi' ? 'vi' : 'en';
  const options = useOptions();
  const can = useCan();
  const hidden = ` (${t('cfg.hidden')})`;

  // Quan hệ cha – con: chọn cha khi thêm / sửa (vị trí theo cha), liệt kê con.
  const { all, allError } = useAllEquipment(rows, ctx.row?.updated_at);
  const record = ctx.creating ? null : ctx.row;
  // Thiết bị đang xem + con cháu (subtree): không chọn làm cha được (tạo vòng lặp).
  const { childrenOf, subtree } = useMemo(() => equipmentFamily(all, record?.id), [all, record?.id]);
  const parentOf = (d: Draft) => (d.parent_id ? all?.find((e) => e.id === d.parent_id) : undefined);
  const parentLocation = (d: Draft) =>
    parentOf(d)?.location ?? (record && d.parent_id === record.parent_id ? record.location : null);
  const parentChoices = () => (all ?? []).filter((e) => !subtree.has(e.id)).map((e) => ({
    value: e.id, label: [e.serial_number, e.part_number, e.location].filter(Boolean).join(' · '),
  }));
  const addChild = ctx.create && can.edit ? (parent: EquipmentRow) => ctx.create!({ parent_id: parent.id }) : undefined;

  const sections: SectionDef<EquipmentRow>[] = [
    {
      key: 'identity', title: t('eq.groupIdentity'), fields: [
        { key: 'serial_number', label: t('fields.serial_number'), required: true, maxLength: 200 },
        { key: 'part_number_id', label: t('fields.part_number'), kind: 'select', view: (r) => r.part_number,
          options: (_d, r) => toSelect(options?.part_numbers, r?.part_number_id, hidden) },
        { key: 'jabil_id', label: t('fields.jabil_id'), maxLength: 200 },
        { key: 'asset', label: t('fields.asset'), maxLength: 200 },
      ],
    },
    {
      key: 'classification', title: t('eq.groupClassification'), fields: [
        { key: 'type_id', label: t('fields.type'), kind: 'select', view: (r) => r.type,
          options: (_d, r) => toSelect(options?.types, r?.type_id, hidden) },
        { key: 'level_id', label: t('fields.level'), kind: 'select', view: (r) => r.level,
          options: (_d, r) => toSelect(options?.levels, r?.level_id, hidden) },
        { key: 'status_id', label: t('fields.status'), kind: 'select', view: (r) => <StatusTag name={r.status} color={r.status_color} />,
          options: () => statusSelect(options?.statuses), required: true },
      ],
    },
    {
      key: 'location', title: t('eq.groupLocationRelation'), fields: [
        { key: 'location_id', label: t('fields.location'), kind: 'select', required: (d) => !d.parent_id,
          view: (r) => (r.parent_id ? <>{r.location}<span className="eq-note">{t('eq.fromParent')}</span></> : r.location),
          options: (_d, r) => toSelect(options?.locations, r?.location_id, hidden),
          lock: (_r, d) => (d.parent_id ? t('eq.locationFromParent') : null),
          draftView: parentLocation },
        { key: 'parent_id', label: t('fields.parent'), kind: 'select',
          options: parentChoices,
          view: (r) => (r.parent_id ? (
            <EquipmentChip serial={r.parent_serial ?? '—'} part={all?.find((e) => e.id === r.parent_id)?.part_number}
              onOpen={() => ctx.open(r.parent_id!)} />
          ) : <span className="dp-empty">{t('eq.noParent')}</span>),
          editHint: ctx.creating ? t('eq.parentCreateHint') : t('eq.parentHint') },
        { key: 'children', label: t('fields.children'), readOnly: true, hideInCreate: true, wide: true,
          view: (r) => {
            // Chưa tải xong / tải lỗi: nói đúng như vậy, không báo "không có thiết bị con".
            if (!all) return <span className="dp-empty">{allError ?? t('common.loadingEllipsis')}</span>;
            const kids = childrenOf.get(r.id) ?? [];
            return kids.length ? (
              <div className="eq-rel">
                {kids.map((c) => <EquipmentChip key={c.id} serial={c.serial_number} part={c.part_number} onOpen={() => ctx.open(c.id)} />)}
              </div>
            ) : <span className="dp-empty">{t('eq.noChildren')}</span>;
          } },
        { key: 'children_mode', label: t('eq.childrenQuestion'), kind: 'radio', required: true, wide: true,
          when: (d, r) => !!r?.has_children && (
            (d.parent_id ?? null) !== (r.parent_id ?? null) || (!d.parent_id && d.location_id !== r.location_id)),
          options: (_d, r) => [
            { value: 'follow', label: t('eq.editFollow', { serial: r?.serial_number ?? '' }) },
            { value: 'stay', label: r?.parent_id ? t('eq.editStay', { target: r.parent_serial ?? '—' }) : t('eq.editStayAlone') },
          ],
          editHint: ctx.row ? t('eq.hasChildren', {
            serial: ctx.row.serial_number, count: (childrenOf.get(ctx.row.id) ?? []).length,
            kids: (childrenOf.get(ctx.row.id) ?? []).map((c) => c.serial_number).join(', '),
          }) : undefined },
      ],
    },
    {
      key: 'notes', title: t('eq.groupNotes'), fields: [
        { key: 'remark', label: t('fields.remark'), kind: 'textarea', wide: true, maxLength: 1000,
          required: (d) => statusRequiresRemark(options?.statuses, d.status_id) },
      ],
    },
    ...extensions,
  ];

  const actions: ActionDef<EquipmentRow>[] = [
    ...(addChild ? [{ key: 'add-child', label: t('eq.addChild'), icon: <Plus size={14} aria-hidden="true" />, onClick: addChild }] : []),
    { key: 'location', label: t('eq.changeLocation'), icon: <MapPin size={14} aria-hidden="true" />,
      visible: (r) => !r.parent_id, screen: (a) => <ChangeLocationScreen ctx={a} rows={all} /> },
    // Chưa có cha: "Gắn vào thiết bị cha"; đã có cha: "Đổi cha" — cùng màn hình chọn thiết bị có sẵn.
    { key: 'attach', label: t('eq.attachParent'), icon: <Link2 size={14} aria-hidden="true" />,
      visible: (r) => !r.parent_id, screen: (a) => <MoveScreen ctx={a} rows={all} /> },
    { key: 'move', label: t('eq.move'), icon: <GitBranch size={14} aria-hidden="true" />,
      visible: (r) => !!r.parent_id, screen: (a) => <MoveScreen ctx={a} rows={all} /> },
    { key: 'swap', label: t('eq.swap'), icon: <ArrowRightLeft size={14} aria-hidden="true" />, screen: (a) => <SwapScreen ctx={a} rows={all} /> },
    { key: 'detach', label: t('eq.detach'), icon: <Unlink size={14} aria-hidden="true" />,
      visible: (r) => !!r.parent_id, screen: (a) => <DetachScreen ctx={a} rows={all} /> },
    // Thiết bị có con: Xóa mở màn hình hỏi xóa cả nhánh hay giữ con; không có con thì xác nhận ở footer như mọi module.
    { key: 'delete-tree', label: t('common.delete'), icon: <Trash2 size={14} aria-hidden="true" />, danger: true,
      visible: (r) => can.remove && r.has_children, screen: (a) => <DeleteScreen ctx={a} rows={all} /> },
  ];

  // Thao tác cây đổi cả các dòng khác (thiết bị đổi chỗ, con, cờ "có con") → tải lại masterlist.
  const onSaved = (row: EquipmentRow, created: boolean) => { ctx.onSaved(row, created); ctx.reload?.(); };
  const onDeleted = (row: EquipmentRow) => { ctx.onDeleted(row); ctx.reload?.(); };

  return (
    <RecordDetail<EquipmentRow>
      layout={layout}
      record={ctx.row}
      creating={ctx.creating}
      loading={ctx.loading}
      error={ctx.error}
      onRetry={ctx.onRetry}
      icon={<Cpu size={18} />}
      createTitle={ctx.defaults?.parent_id ? t('eq.addChildTitle', { serial: parentOf(ctx.defaults)?.serial_number ?? '' }) : t('eq.addTitle')}
      defaults={ctx.defaults}
      heading={(r) => ({
        title: r.serial_number,
        tags: <StatusTag name={r.status} color={r.status_color} />,
        subtitle: [r.part_number, r.type].filter(Boolean).join(' · ') || undefined,
        meta: (
          <>
            {r.location && <span><MapPin size={12} aria-hidden="true" /> {r.location}</span>}
            {r.parent_serial && <span>{t('eq.parentShort')}: {r.parent_serial}</span>}
            <span>{t('dp.updated', { when: formatRelativeTime(r.updated_at, language), who: r.updated_by_name ?? '—' })}</span>
          </>
        ),
      })}
      sections={sections}
      extraTabs={[{ key: 'tree', label: t('eq.tabTree'), render: (r) => <EquipmentTree equipmentId={r.id} onOpen={ctx.open} /> }]}
      historyUrl={(r) => `/api/equipment/${r.id}/history`}
      historyLabels={{ parent: t('fields.parent') }}
      canEdit={can.edit}
      onSave={async (payload, record) => {
        const res = record
          ? await api.put<EquipmentRow>(`/api/equipment/${record.id}`, payload)
          : await api.post<EquipmentRow>('/api/equipment', payload);
        return { row: res.data, message: res.meta.duplicate ? t('eq.duplicateSerial') : undefined };
      }}
      actions={actions}
      canDelete={can.remove && !ctx.row?.has_children}
      onDelete={async (r) => { await api.delete(`/api/equipment/${r.id}`); }}
      nav={ctx.nav}
      onClose={ctx.onClose}
      onExpand={ctx.onExpand}
      onSaved={onSaved}
      onDeleted={onDeleted}
      leaveRef={ctx.leaveRef}
    />
  );
}
