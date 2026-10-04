'use client';

/**
 * Màn hình thao tác của thiết bị (thay thân Detail Panel, không mở hộp thoại):
 * Đổi vị trí · Gắn vào / Đổi cha · Swap · Tách khỏi cha · Xóa (thiết bị có con).
 *
 * Thiết bị có con: bắt buộc chọn con **đi theo** hay **ở lại chỗ cũ** — ở lại thì
 * con giữ vị trí và gắn vào thiết bị đến thay (Swap) hoặc thiết bị cha cũ (không
 * có cha cũ thì đứng riêng). Cháu luôn đi cùng con của nó. database/04_functions.sql mục 3.
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/client/api';
import { toSelect, useOptions } from '@/lib/client/options';
import { Notice } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ActionField, ActionScreen, type ActionCtx } from '@/components/ui/detail/RecordDetail';
import type { ChildrenMode, EquipmentRow } from '@/lib/types';

/**
 * Quan hệ cha – con tính từ danh sách thiết bị: con trực tiếp của mỗi thiết bị
 * (theo serial), cây con (gồm chính nó) và tổ tiên của `id` — để loại khỏi
 * lựa chọn (chọn làm cha / Swap sẽ tạo vòng lặp).
 */
export function equipmentFamily(rows: EquipmentRow[] | null, id: string | undefined) {
  const childrenOf = new Map<string, EquipmentRow[]>();
  const byId = new Map<string, EquipmentRow>();
  (rows ?? []).forEach((r) => {
    byId.set(r.id, r);
    if (r.parent_id) childrenOf.set(r.parent_id, [...(childrenOf.get(r.parent_id) ?? []), r]);
  });
  childrenOf.forEach((list) => list.sort((a, b) => a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true })));
  const subtree = new Set<string>();
  const stack = id ? [id] : [];
  while (stack.length) { const cur = stack.pop()!; subtree.add(cur); stack.push(...(childrenOf.get(cur) ?? []).map((c) => c.id)); }
  const ancestors = new Set<string>();
  for (let p = id ? byId.get(id)?.parent_id : null; p && !ancestors.has(p); p = byId.get(p)?.parent_id) ancestors.add(p);
  return { childrenOf, subtree, ancestors };
}

/** Màn hình thao tác dùng danh sách thiết bị Detail đang có (masterlist / trang riêng) — không tải lại. */
type ScreenProps = { ctx: ActionCtx<EquipmentRow>; rows: EquipmentRow[] | null };

const label = (r: EquipmentRow) => `${r.serial_number}${r.part_number ? ` · ${r.part_number}` : ''}${r.location ? ` · ${r.location}` : ''}`;
const serials = (list: EquipmentRow[]) => list.map((r) => r.serial_number).join(', ');

/**
 * Hỏi thiết bị con đi theo hay ở lại — bắt buộc chọn (không có mặc định) để
 * người dùng biết rõ con sẽ đi đâu. `groups`: bên nào có con (Swap có thể cả hai).
 */
function ChildrenChoice({ groups, value, onChange, followLabel, stayLabel, followHint, stayHint }: {
  groups: { owner: EquipmentRow; kids: EquipmentRow[] }[];
  value: ChildrenMode | null;
  onChange: (mode: ChildrenMode) => void;
  followLabel?: string;
  stayLabel?: string;
  followHint: string;
  stayHint: string;
}) {
  const { t } = useTranslation();
  const name = useId();
  const options: { mode: ChildrenMode; title: string; hint: string }[] = [
    { mode: 'follow', title: followLabel ?? t('eq.childrenFollow'), hint: followHint },
    { mode: 'stay', title: stayLabel ?? t('eq.childrenStay'), hint: stayHint },
  ];
  return (
    <>
      <Notice tone="warn">
        {groups.map((g) => t('eq.hasChildren', { serial: g.owner.serial_number, count: g.kids.length, kids: serials(g.kids) })).join(' ')}
        {' '}{t('eq.chooseChildren')}
      </Notice>
      <ActionField label={t('eq.childrenQuestion')} required>
        <div className="eq-choice" role="radiogroup" aria-label={t('eq.childrenQuestion')}>
          {options.map((o) => (
            <label key={o.mode}>
              <input type="radio" name={name} value={o.mode} checked={value === o.mode} onChange={() => onChange(o.mode)} />
              <span className="eq-choice-text"><strong>{o.title}</strong><span>{o.hint}</span></span>
            </label>
          ))}
        </div>
      </ActionField>
    </>
  );
}

export function ChangeLocationScreen({ ctx, rows }: ScreenProps) {
  const { t } = useTranslation();
  const options = useOptions();
  const kids = equipmentFamily(rows, ctx.record.id).childrenOf.get(ctx.record.id) ?? [];
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState<ChildrenMode | null>(null);
  async function confirm() {
    const r = await api.post<EquipmentRow>(`/api/equipment/${ctx.record.id}/change-location`, { location_id: location, children: mode ?? 'follow' });
    ctx.done(r.data, t('eq.locationChanged'));
  }
  return (
    <ActionScreen title={t('eq.changeLocation')} onCancel={ctx.cancel} onConfirm={confirm}
      confirmDisabled={!location || location === ctx.record.location_id || !rows || (kids.length > 0 && !mode)}>
      <ActionField label={t('eq.currentLocation')}>{ctx.record.location ?? '—'}</ActionField>
      <ActionField label={t('eq.newLocation')} required>
        <SearchableSelect value={location} onChange={setLocation} options={toSelect(options?.locations).filter((o) => o.value !== ctx.record.location_id)}
          placeholder={t('dp.selectPlaceholder')} ariaLabel={t('eq.newLocation')} />
      </ActionField>
      {kids.length > 0 && (
        <ChildrenChoice groups={[{ owner: ctx.record, kids }]} value={mode} onChange={setMode}
          followHint={t('eq.followLocation', { serial: ctx.record.serial_number })}
          stayHint={t('eq.stayAlone', { location: ctx.record.location ?? '—' })} />
      )}
    </ActionScreen>
  );
}

/** Gắn vào thiết bị cha (chưa có cha) / Đổi cha — vị trí theo cha mới. */
export function MoveScreen({ ctx, rows }: ScreenProps) {
  const { t } = useTranslation();
  const { childrenOf, subtree } = useMemo(() => equipmentFamily(rows, ctx.record.id), [rows, ctx.record.id]);
  const kids = childrenOf.get(ctx.record.id) ?? [];
  const [parent, setParent] = useState('');
  const [mode, setMode] = useState<ChildrenMode | null>(null);
  const choices = useMemo(() => (rows ?? []).filter((r) => !subtree.has(r.id) && r.id !== ctx.record.parent_id)
    .map((r) => ({ value: r.id, label: label(r) })), [rows, subtree, ctx.record.parent_id]);
  const target = rows?.find((r) => r.id === parent);
  async function confirm() {
    const r = await api.post<EquipmentRow>(`/api/equipment/${ctx.record.id}/move`, { parent_id: parent, children: mode ?? 'follow' });
    ctx.done(r.data, t('eq.moved'));
  }
  const stayHint = ctx.record.parent_id
    ? t('eq.stayUnder', { serial: ctx.record.parent_serial ?? '—', location: ctx.record.location ?? '—' })
    : t('eq.stayAlone', { location: ctx.record.location ?? '—' });
  return (
    <ActionScreen title={ctx.record.parent_id ? t('eq.move') : t('eq.attachParent')} description={t('eq.moveDesc')}
      onCancel={ctx.cancel} onConfirm={confirm} confirmDisabled={!parent || (kids.length > 0 && !mode)}>
      {ctx.record.parent_id && <ActionField label={t('eq.currentParent')}>{ctx.record.parent_serial}</ActionField>}
      <ActionField label={t('eq.newParent')} required>
        <SearchableSelect value={parent} onChange={setParent} options={choices} placeholder={rows ? t('dp.selectPlaceholder') : t('common.loadingEllipsis')}
          ariaLabel={t('eq.newParent')} />
      </ActionField>
      {kids.length > 0 && (
        <ChildrenChoice groups={[{ owner: ctx.record, kids }]} value={mode} onChange={setMode}
          followHint={t('eq.followParent', { serial: ctx.record.serial_number })} stayHint={stayHint} />
      )}
      {target && (
        <ActionField label={t('eq.preview')}>
          <ul className="dp-preview">
            <li><strong>{ctx.record.serial_number}</strong> → {t('eq.movePreview', { serial: target.serial_number, location: target.location ?? '—' })}</li>
            {kids.length > 0 && mode && (
              <li>{mode === 'follow'
                ? t('eq.kidsFollow', { kids: serials(kids), serial: ctx.record.serial_number })
                : t('eq.kidsStay', { kids: serials(kids), target: ctx.record.parent_serial ?? t('eq.standalone') })}</li>
            )}
          </ul>
        </ActionField>
      )}
    </ActionScreen>
  );
}

export function SwapScreen({ ctx, rows }: ScreenProps) {
  const { t } = useTranslation();
  const { childrenOf, subtree, ancestors } = useMemo(() => equipmentFamily(rows, ctx.record.id), [rows, ctx.record.id]);
  const [other, setOther] = useState('');
  const [mode, setMode] = useState<ChildrenMode | null>(null);
  const choices = useMemo(() => (rows ?? []).filter((r) => !subtree.has(r.id) && !ancestors.has(r.id))
    .map((r) => ({ value: r.id, label: label(r) })), [rows, subtree, ancestors]);
  const target = rows?.find((r) => r.id === other);
  const a = ctx.record;
  const aKids = childrenOf.get(a.id) ?? [];
  const bKids = (target && childrenOf.get(target.id)) || [];
  const groups = target ? [{ owner: a, kids: aKids }, { owner: target, kids: bKids }].filter((g) => g.kids.length > 0) : [];
  const hasKids = groups.length > 0;
  // Cùng cha + cùng vị trí: swap cả nhánh không đổi gì (chỉ swap "con ở lại" mới đổi con cho nhau).
  const samePlace = !!target && (a.parent_id ?? null) === (target.parent_id ?? null) && a.location_id === target.location_id;
  const noChange = samePlace && (!hasKids || mode === 'follow');
  async function confirm() {
    const r = await api.post<EquipmentRow>('/api/equipment/swap', { a: a.id, b: other, children: mode ?? 'follow' });
    ctx.done(r.data, t('eq.swapped'));
  }
  const place = (r: EquipmentRow) => `${r.parent_serial ? t('eq.underParent', { serial: r.parent_serial }) : t('eq.noParent')} · ${r.location ?? '—'}`;
  const stayMoves = target ? [
    ...aKids.map((k) => `${k.serial_number} → ${target.serial_number}`),
    ...bKids.map((k) => `${k.serial_number} → ${a.serial_number}`),
  ].join(', ') : '';
  return (
    <ActionScreen title={t('eq.swap')} description={t('eq.swapDesc')} onCancel={ctx.cancel} onConfirm={confirm}
      confirmDisabled={!other || (hasKids && !mode) || noChange}>
      <ActionField label={t('eq.swapWith')} required>
        <SearchableSelect value={other} onChange={(v) => { setOther(v); setMode(null); }} options={choices}
          placeholder={rows ? t('dp.selectPlaceholder') : t('common.loadingEllipsis')} ariaLabel={t('eq.swapWith')} />
      </ActionField>
      {target && hasKids && (
        <ChildrenChoice groups={groups} value={mode} onChange={setMode}
          followHint={t('eq.swapFollowHint')} stayHint={t('eq.swapStayHint', { moves: stayMoves })} />
      )}
      {noChange && <Notice tone="warn">{hasKids ? t('eq.swapNoChangeKids') : t('eq.swapNoChange')}</Notice>}
      {target && !noChange && (
        <ActionField label={t('eq.preview')}>
          <ul className="dp-preview">
            <li><strong>{a.serial_number}</strong> → {place(target)}</li>
            <li><strong>{target.serial_number}</strong> → {place(a)}</li>
            {mode && groups.map((g) => {
              const newcomer = g.owner.id === a.id ? target : a;
              return (
                <li key={g.owner.id}>{mode === 'follow'
                  ? t('eq.kidsFollow', { kids: serials(g.kids), serial: g.owner.serial_number })
                  : t('eq.kidsStay', { kids: serials(g.kids), target: newcomer.serial_number })}</li>
              );
            })}
          </ul>
        </ActionField>
      )}
    </ActionScreen>
  );
}

export function DetachScreen({ ctx, rows }: ScreenProps) {
  const { t } = useTranslation();
  const kids = equipmentFamily(rows, ctx.record.id).childrenOf.get(ctx.record.id) ?? [];
  const [mode, setMode] = useState<ChildrenMode | null>(null);
  async function confirm() {
    const r = await api.post<EquipmentRow>(`/api/equipment/${ctx.record.id}/detach`, { children: mode ?? 'follow' });
    ctx.done(r.data, t('eq.detached'));
  }
  return (
    <ActionScreen title={t('eq.detach')} onCancel={ctx.cancel} onConfirm={confirm}
      confirmDisabled={!rows || (kids.length > 0 && !mode)}
      description={t('eq.detachDesc', { serial: ctx.record.parent_serial ?? '—', location: ctx.record.location ?? '—' })}>
      {kids.length > 0 && (
        <ChildrenChoice groups={[{ owner: ctx.record, kids }]} value={mode} onChange={setMode}
          followHint={t('eq.followDetach', { serial: ctx.record.serial_number })}
          stayHint={t('eq.stayUnder', { serial: ctx.record.parent_serial ?? '—', location: ctx.record.location ?? '—' })} />
      )}
    </ActionScreen>
  );
}

/** Xóa thiết bị có con: xóa cả nhánh hay chỉ thiết bị này (con gắn vào cha cũ / đứng riêng). */
export function DeleteScreen({ ctx, rows }: ScreenProps) {
  const { t } = useTranslation();
  const { childrenOf, subtree } = equipmentFamily(rows, ctx.record.id);
  const kids = childrenOf.get(ctx.record.id) ?? [];
  const below = Math.max(subtree.size - 1, kids.length);
  const [mode, setMode] = useState<ChildrenMode | null>(null);
  async function confirm() {
    const r = await api.delete<{ deleted: number }>(`/api/equipment/${ctx.record.id}?children=${mode ?? 'follow'}`);
    ctx.removed(t('eq.deletedCount', { count: r.data.deleted }));
  }
  const stayHint = ctx.record.parent_id
    ? t('eq.stayUnder', { serial: ctx.record.parent_serial ?? '—', location: ctx.record.location ?? '—' })
    : t('eq.stayAlone', { location: ctx.record.location ?? '—' });
  return (
    <ActionScreen title={t('eq.deleteTitle', { serial: ctx.record.serial_number })} description={t('eq.deleteDesc')}
      onCancel={ctx.cancel} onConfirm={confirm} danger confirmLabel={t('common.delete')}
      confirmDisabled={!rows || (kids.length > 0 && !mode)}>
      {kids.length > 0 && (
        <ChildrenChoice groups={[{ owner: ctx.record, kids }]} value={mode} onChange={setMode}
          followLabel={t('eq.deleteFollow')} stayLabel={t('eq.deleteStay')}
          followHint={t('eq.deleteFollowHint', { serial: ctx.record.serial_number, count: below })} stayHint={stayHint} />
      )}
    </ActionScreen>
  );
}
