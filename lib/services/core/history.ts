import 'server-only';

/**
 * Đọc bảng <module>_histories (tab Lịch sử) — mọi module dùng chung khuôn.
 * Ghi lịch sử do database tự làm (trigger write_history).
 */
import { db, selectAll } from './db';
import { mapRpcError } from '@/lib/errors';
import type { HistoryEntry } from '@/lib/types';

const COLUMNS = 'id, label, action, changes, note, source, created_at, created_by';

type Filter = { column: string; value: string };

export async function readHistory(table: string, filters: Filter[], limit = 500): Promise<HistoryEntry[]> {
  let query = db().from(table).select(COLUMNS).order('created_at', { ascending: false }).limit(limit);
  for (const f of filters) query = query.eq(f.column, f.value);
  const { data, error } = await query;
  if (error) throw mapRpcError(error);
  const rows = (data ?? []) as Omit<HistoryEntry, 'created_by_name'>[];
  return withActorNames(rows);
}

export async function withActorNames<T extends { created_by: string | null }>(rows: T[]): Promise<(T & { created_by_name: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const users = await selectAll<{ id: string; full_name: string }>('user_profiles', 'id, full_name');
    users.forEach((u) => names.set(u.id, u.full_name));
  }
  return rows.map((r) => ({ ...r, created_by_name: r.created_by ? names.get(r.created_by) ?? null : null }));
}
