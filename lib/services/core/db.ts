import 'server-only';

/**
 * Truy cập database dùng chung cho mọi module.
 *
 * - selectAll: đọc hết một bảng (Supabase trả tối đa 1000 dòng mỗi lần).
 * - appWrite: mọi thêm / sửa / xóa đi qua RPC app_write (database/04_functions.sql)
 *   để lịch sử được ghi trong cùng giao dịch, kèm người thao tác.
 * - rpc: gọi các thao tác nhiều bước (Move, Swap…).
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AppError, mapRpcError } from '@/lib/errors';

export const db = supabaseAdmin;

const PAGE = 1000;

export async function selectAll<T>(table: string, columns = '*', order = 'id'): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from(table).select(columns).order(order).range(from, from + PAGE - 1);
    if (error) throw mapRpcError(error);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function selectOne<T>(table: string, id: string, columns = '*'): Promise<T | null> {
  const { data, error } = await db().from(table).select(columns).eq('id', id).maybeSingle();
  if (error) throw mapRpcError(error);
  return (data as T | null) ?? null;
}

export type WriteOptions = { action?: string; note?: string; source?: 'ui' | 'import' | 'script' };

export async function appWrite<T = Record<string, unknown>>(
  table: string,
  op: 'insert' | 'update' | 'delete',
  id: string | null,
  data: Record<string, unknown> | null,
  actor: string | null,
  options: WriteOptions = {},
): Promise<T> {
  const { data: result, error } = await db().rpc('app_write', {
    p_table: table,
    p_op: op,
    p_id: id,
    p_data: data,
    p_actor: actor,
    p_action: options.action ?? null,
    p_note: options.note ?? null,
    p_source: options.source ?? 'ui',
  });
  if (error) throw mapRpcError(error);
  if (!result) throw new AppError('NOT_FOUND');
  return result as T;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw mapRpcError(error);
  return data as T;
}
