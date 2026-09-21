'use client';

/**
 * API client.
 *
 * Mọi lỗi từ server đều có { code, message, request_id }. ApiError giữ nguyên
 * request_id để user đọc cho Admin khi báo lỗi — log Vercel chỉ giữ ~1 giờ nên
 * đây là sợi dây duy nhất nối báo cáo của user với error_log trong DB.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Lỗi do người khác vừa sửa dữ liệu — UI cần mời tải lại thay vì báo đỏ. */
  get isConflict() {
    return this.code === 'OPTIMISTIC_CONFLICT' || this.code === 'LOCK_TIMEOUT';
  }

  /** Lỗi theo từng trường, để gắn vào ô nhập tương ứng. */
  get fieldErrors(): Record<string, string> {
    const f = this.details.fields;
    return f && typeof f === 'object' ? (f as Record<string, string>) : {};
  }
}

type Envelope<T> =
  | { success: true; data: T; meta: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; details: Record<string, unknown>; request_id: string } };

export type Result<T> = { data: T; meta: Record<string, unknown> };

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError('SERVER_ERROR', 'Máy chủ trả về dữ liệu không đọc được.', {}, '-', res.status);
  }

  if (!body.success) {
    throw new ApiError(
      body.error.code, body.error.message, body.error.details,
      body.error.request_id, res.status,
    );
  }
  return { data: body.data, meta: body.meta };
}

export const api = {
  /** `init` is mainly for an AbortSignal — a fast-typing search/filter
   *  change should cancel its own previous in-flight GET rather than let
   *  an older, now-obsolete response arrive after a newer one and clobber
   *  it (see EquipmentMasterlist's fetchRows for the calling pattern). */
  get: <T>(path: string, init?: RequestInit) => call<T>(path, init),
  post: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) =>
    call<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => call<T>(path, { method: 'DELETE' }),
};

// --------------------------------------------------------------------------
// Kiểu dữ liệu dùng chung
// --------------------------------------------------------------------------

export type LocationRef = { id: string; code: string; name: string | null; sort_order: number };
export type MasterDataRef = { id: string; code: string; display_name: string; description: string | null; display_order: number; is_active: boolean };
export type StatusRef = MasterDataRef & { requires_remark: boolean };

export type Equipment = {
  id: string;
  jabil_id: string | null;
  part_number: string | null;
  serial_number: string;
  asset: string | null;
  type_id: string | null;
  level_id: string | null;
  status_id: string | null;
  type: MasterDataRef | null;
  level: MasterDataRef | null;
  status: StatusRef | null;
  calibration_required: boolean;
  custom_fields: Record<string, unknown>;
  remark: string | null;
  current_location_id: string;
  current_location: LocationRef | null;
  parent_id: string | null;
  parent: { id: string; part_number: string | null; serial_number: string } | null;
  has_children?: boolean;
  version: number;
  archived_at: string | null;
  updated_at: string;
};

export type DropdownOption = { value: string; label: string; is_active: boolean };

export type InputType =
  | 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'dropdown'
  | 'location_ref' | 'type_ref' | 'status_ref' | 'level_ref';

export type FieldDefinition = {
  id: string;
  field_key: string;
  display_label: string;
  data_type: 'text' | 'number' | 'date' | 'boolean';
  input_type: InputType;
  is_required: boolean;
  dropdown_options: DropdownOption[] | null;
  is_visible: boolean;
  display_order: number;
  max_length: number | null;
  help_text: string | null;
  placeholder: string | null;
  is_system: boolean;
};

export type ContextNode = {
  id: string; serial_number: string; part_number: string | null;
  type_id: string | null; status_id: string | null; level_id: string | null;
  current_location_id: string; parent_id: string | null;
  archived_at: string | null; depth: number;
};

export type AuditEntry = {
  id: string; action: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  changed_by: string | null;
  /** Resolved server-side (lib/services/equipment.ts) from changed_by — a
   *  name a person reading the History tab recognizes, not a uuid. */
  actor_name: string | null;
  created_at: string;
  note: string | null; source: string; request_id: string | null;
};

export type CalibrationStatusValue = 'NOT_REQUIRED' | 'NOT_CALIBRATED' | 'OVERDUE' | 'DUE_SOON' | 'VALID';

export type CalibrationStatus = {
  equipment_id: string;
  calibration_required: boolean;
  last_calibration_date: string | null;
  calibration_due_date: string | null;
  last_calibrated_by: string | null;
  calibration_status: CalibrationStatusValue;
};

export type CalibrationRecord = {
  id: string; equipment_id: string;
  calibration_date: string; calibration_due_date: string; calibrated_by: string;
  created_by: string | null; created_by_name: string | null; created_at: string;
};

export type RepairRecord = {
  id: string; equipment_id: string; repair_type: 'internal' | 'vendor';
  problem: string | null; repair_start_date: string | null; repair_end_date: string | null;
  vendor_name: string | null; repair_action: string | null; repair_result: string | null;
  quotation_ref: string | null; repair_cost: number | null; remark: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
};

/** Hiển thị giờ Việt Nam. Dữ liệu lưu timestamptz. */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso));
}

/**
 * "2h ago" for anything recent, falling back to `formatTime` past a week —
 * the header's Updated line doesn't need minute-level precision, but the
 * absolute timestamp is still what audit/history entries show.
 */
export function formatRelativeTime(iso: string | null, language: 'en' | 'vi'): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return language === 'vi' ? 'vừa xong' : 'just now';
  if (minutes < 60) return language === 'vi' ? `${minutes} phút trước` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return language === 'vi' ? `${hours} giờ trước` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return language === 'vi' ? `${days} ngày trước` : `${days}d ago`;
  return formatTime(iso);
}

/** Đổi value đã lưu sang label người dùng đọc; giữ nguyên nếu option đã bị gỡ. */
export function optionLabel(def: FieldDefinition | undefined, value: string | null): string {
  if (!value) return '—';
  const opt = def?.dropdown_options?.find((o) => o.value === value);
  return opt?.label ?? value;
}
