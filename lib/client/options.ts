'use client';

/**
 * Danh sách chọn dùng chung (Part Number, Location, Type, Status, …) — tải
 * một lần, dùng lại cho mọi form; refreshOptions() sau khi Configuration đổi.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '@/lib/client/api';
import { toast } from '@/components/ui';
import type { SelectOption } from '@/components/ui/SearchableSelect';
import type { OptionItem, Options, StatusOption } from '@/lib/types';

let cache: Options | null = null;
let inflight: Promise<Options> | null = null;
const listeners = new Set<(o: Options) => void>();

function load(force = false): Promise<Options> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = api.get<Options>('/api/options').then((r) => {
    cache = r.data;
    inflight = null;
    listeners.forEach((l) => l(r.data));
    return r.data;
  }).catch((e) => { inflight = null; throw e; });
  return inflight;
}

/** Sau khi Configuration đổi dữ liệu gốc: tải lại danh sách chọn cho mọi form. Lỗi → chỗ gọi báo. */
export async function refreshOptions(): Promise<void> {
  await load(true);
}

export function useOptions(): Options | null {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Options | null>(cache);
  useEffect(() => {
    listeners.add(setOptions);
    // Không tải được → các ô chọn trống: báo một lần (toast gộp các báo trùng nhau).
    load().then(setOptions, (e: unknown) => toast.error(errorMessage(e, t)));
    return () => { listeners.delete(setOptions); };
  }, [t]);
  return options;
}

/** Lựa chọn cho ô chọn: ẩn giá trị đã ẩn, trừ giá trị đang dùng (vẫn hiện, ghi "đã ẩn"). */
export function toSelect(items: OptionItem[] | undefined, current?: string | null, hiddenSuffix = ''): SelectOption[] {
  return (items ?? [])
    .filter((o) => o.is_active || o.id === current)
    .map((o) => ({ value: o.id, label: o.is_active ? o.display_name : `${o.display_name}${hiddenSuffix}` }));
}

/** Một danh sách trạng thái chung cho Equipment và Golden (Calibration dùng trạng thái của thiết bị). */
export function statusSelect(statuses: StatusOption[] | undefined): SelectOption[] {
  return (statuses ?? []).map((s) => ({ value: s.id, label: s.display_name }));
}

export function statusRequiresRemark(statuses: StatusOption[] | undefined, id: unknown): boolean {
  return !!statuses?.find((s) => s.id === id)?.requires_remark;
}
