'use client';

/**
 * Danh sách chọn dùng chung (Part Number, Location, Type, Status, …) — tải
 * một lần, dùng lại cho mọi form; refreshOptions() sau khi Configuration đổi.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import type { OptionItem, Options, StatusOption, StatusPage } from '@/lib/types';

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

export function refreshOptions(): void {
  void load(true).catch(() => {});
}

export function useOptions(): Options | null {
  const [options, setOptions] = useState<Options | null>(cache);
  useEffect(() => {
    listeners.add(setOptions);
    void load().then(setOptions).catch(() => {});
    return () => { listeners.delete(setOptions); };
  }, []);
  return options;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

/** Lựa chọn cho ô chọn: ẩn giá trị đã ẩn, trừ giá trị đang dùng (vẫn hiện, ghi "đã ẩn"). */
export function toSelect(items: OptionItem[] | undefined, current?: string | null, hiddenSuffix = ''): SelectOption[] {
  return (items ?? [])
    .filter((o) => o.is_active || o.id === current)
    .map((o) => ({ value: o.id, label: o.is_active ? o.display_name : `${o.display_name}${hiddenSuffix}` }));
}

export function statusSelect(statuses: StatusOption[] | undefined, page: StatusPage): SelectOption[] {
  return (statuses ?? []).filter((s) => s.applies_to.includes(page)).map((s) => ({ value: s.id, label: s.display_name }));
}

export function statusRequiresRemark(statuses: StatusOption[] | undefined, id: unknown): boolean {
  return !!statuses?.find((s) => s.id === id)?.requires_remark;
}
