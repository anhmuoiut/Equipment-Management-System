import 'server-only';

/**
 * Dashboard — không có bảng riêng, chỉ đọc từ các module
 * (docs/DATABASE_MODIFIED.md mục 1).
 */
import { db, selectAll } from './core/db';
import { withActorNames } from './core/history';
import { loadLookups, nameOf, statusColorOf, type Lookups } from './core/lookups';
import { listCalibration } from './calibration';
import { mapRpcError } from '@/lib/errors';
import type { Role } from '@/lib/permissions';
import type { CountItem, DashboardData, HistoryModule, RecentActivity, StatusCountItem } from '@/lib/types';

function countBy(rows: { key: string | null }[], label: (id: string | null) => string | null): CountItem[] {
  const counts = new Map<string | null, number>();
  rows.forEach((r) => counts.set(r.key, (counts.get(r.key) ?? 0) + 1));
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: label(id), count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Đếm theo trạng thái, kèm màu. Xếp theo thứ tự của Configuration › Status
 * (không theo số lượng) để mỗi trạng thái luôn ở cùng một chỗ; chưa có trạng thái ở cuối.
 */
function countByStatus(rows: { status_id: string | null }[], lookups: Lookups): StatusCountItem[] {
  const order = (id: string | null) => (id ? lookups.statuses.get(id)?.sort_order ?? Number.MAX_SAFE_INTEGER : Infinity);
  return countBy(rows.map((r) => ({ key: r.status_id })), (id) => nameOf(lookups.statuses, id))
    .sort((a, b) => order(a.id) - order(b.id) || (a.label ?? '').localeCompare(b.label ?? ''))
    .map((item) => ({ ...item, color: statusColorOf(lookups, item.id) }));
}

export async function getDashboard(role: Role): Promise<DashboardData> {
  // Dữ liệu gốc đọc một lần, dùng chung với danh sách hiệu chuẩn.
  const sharedLookups = loadLookups();
  const [equipment, calibration, lookups, golden, pending] = await Promise.all([
    selectAll<{ status_id: string | null; location_id: string; type_id: string | null }>('equipments', 'id, status_id, location_id, type_id'),
    listCalibration(sharedLookups),
    sharedLookups,
    selectAll<{ status_id: string | null }>('golden_samples', 'id, status_id'),
    role === 'admin'
      ? db().from('user_profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'pending')
      : Promise.resolve(null),
  ]);

  const byDue = (a: { due_date: string | null }, b: { due_date: string | null }) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '');
  return {
    equipment_total: equipment.length,
    golden_total: golden.length,
    calibration_total: calibration.length,
    pending_users: pending ? pending.count ?? 0 : null,
    by_status: {
      equipment: countByStatus(equipment, lookups),
      calibration: countByStatus(calibration, lookups),
      golden_sample: countByStatus(golden, lookups),
    },
    by_location: countBy(equipment.map((e) => ({ key: e.location_id })), (id) => nameOf(lookups.locations, id)),
    by_type: countBy(equipment.map((e) => ({ key: e.type_id })), (id) => nameOf(lookups.types, id)),
    overdue: calibration.filter((c) => c.due_state === 'overdue').sort(byDue),
    due_soon: calibration.filter((c) => c.due_state === 'due_soon').sort(byDue),
  };
}

export type ActivityFilter = { module?: HistoryModule; userId?: string; search?: string; from?: string; to?: string; limit?: number };

/** Thay đổi gần đây (view recent_activities; một lần import = một dòng). Configuration / User chỉ Admin thấy. */
export async function recentActivities(role: Role, filter: ActivityFilter): Promise<RecentActivity[]> {
  let query = db().from('recent_activities')
    .select('module, object_id, label, action, changes, created_by, created_at, note, source, item_count')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(filter.limit ?? 50, 1), 500));
  if (role !== 'admin') query = query.in('module', ['equipment', 'calibration', 'golden_sample']);
  if (filter.module) query = query.eq('module', filter.module);
  if (filter.userId) query = query.eq('created_by', filter.userId);
  // Tìm theo tên / serial (label), không phân biệt hoa thường; % _ trong chữ gõ vào là ký tự thường.
  if (filter.search) query = query.ilike('label', `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`);
  if (filter.from) query = query.gte('created_at', filter.from);
  if (filter.to) query = query.lte('created_at', filter.to);
  const { data, error } = await query;
  if (error) throw mapRpcError(error);
  const rows = await withActorNames((data ?? []) as Omit<RecentActivity, 'created_by_name' | 'id'>[]);
  return rows.map((r, i) => ({ ...r, id: `${r.object_id}-${r.created_at}-${i}` }));
}
