/**
 * export-to-csv — Spec v0.9 mục 55.3.
 *
 * Dev-only, KHÔNG phải tính năng UI (Export UI nằm ở v1.1).
 * Đây là điều kiện rollback: không có script này thì V1 không có đường lấy
 * dữ liệu ra, và pilot bị khoá chân vào hệ thống.
 *
 * Chạy: npx tsx scripts/export-to-csv.ts > backup-$(date +%F).csv
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const COLS = ['id', 'jabil_id', 'part_number', 'serial_number', 'asset', 'type',
  'level', 'status', 'calibration_required', 'remark', 'custom_fields',
  'parent_serial', 'location_code', 'archived_at', 'created_at', 'updated_at'] as const;

function csv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const { data, error } = await db
  .from('equipment')
  .select(`id, jabil_id, part_number, serial_number, asset,
           remark, calibration_required, custom_fields, archived_at, created_at, updated_at,
           parent:parent_id ( serial_number ),
           location:locations!equipment_current_location_id_fkey ( code ),
           type:equipment_types!equipment_type_id_fkey ( display_name ),
           level:equipment_levels!equipment_level_id_fkey ( display_name ),
           status:equipment_statuses!equipment_status_id_fkey ( display_name )`)
  .order('serial_sort');

if (error) { console.error(error.message); process.exit(1); }

console.log(COLS.join(','));
/**
 * PostgREST trả embedded relation dưới dạng object cho FK to-one, nhưng type
 * sinh ra lại là array. Chuẩn hoá cả hai dạng thay vì ép kiểu mù.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
  const parent = one(r.parent as { serial_number?: string } | { serial_number?: string }[] | null);
  const location = one(r.location as { code?: string } | { code?: string }[] | null);
  const type = one(r.type as { display_name?: string } | { display_name?: string }[] | null);
  const level = one(r.level as { display_name?: string } | { display_name?: string }[] | null);
  const status = one(r.status as { display_name?: string } | { display_name?: string }[] | null);
  console.log([
    r.id, r.jabil_id, r.part_number, r.serial_number, r.asset,
    type?.display_name ?? '', level?.display_name ?? '', status?.display_name ?? '',
    r.calibration_required, r.remark, r.custom_fields,
    parent?.serial_number ?? '', location?.code ?? '',
    r.archived_at, r.created_at, r.updated_at,
  ].map(csv).join(','));
}
