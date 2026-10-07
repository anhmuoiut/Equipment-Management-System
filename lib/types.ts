/**
 * Kiểu dữ liệu trao đổi giữa server và client (theo
 * docs/DATABASE_MODIFIED.md). Chỉ có type, dùng được ở cả hai phía.
 * FK luôn đi kèm chữ hiển thị (display_name) để UI không phải tra lại.
 */
import type { AccountStatus, Role } from '@/lib/permissions';

/** Thông tin hệ thống — nhóm cuối của mọi Detail Panel. */
export type Audit = {
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

// ---------------------------------------------------------------- Lựa chọn
export type OptionItem = { id: string; display_name: string; sort_order: number; is_active: boolean };
/** Part number + Type mà mọi thiết bị mang part number này có. */
export type PartNumberOption = OptionItem & { type_id: string; usage_needs_parent: boolean };
/** Trang có Status do hệ thống tự quản (Dashboard đếm theo từng trang): Equipment = In use / Not in use; Calibration = tự tính. */
export type StatusPage = 'equipment' | 'calibration';
/** 5 màu hệ thống của thẻ (tags.color) — mã màu ở globals.css. */
export type StatusColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray';
/** Thẻ (Configuration › Tag) để chọn trong phần Remark của Equipment / Calibration / Golden sample. */
export type TagOption = { id: string; display_name: string; sort_order: number; color: StatusColor };
/** Thẻ đang gắn trên một bản ghi (đã xếp theo thứ tự cấu hình). */
export type TagItem = { id: string; display_name: string; color: StatusColor };
export type Options = {
  part_numbers: PartNumberOption[];
  locations: OptionItem[];
  types: OptionItem[];
  levels: OptionItem[];
  departments: OptionItem[];
  calibration_vendors: OptionItem[];
  tags: TagOption[];
};

// --------------------------------------------------------------- Equipment
/**
 * Thiết bị có con khi di chuyển / xóa: 'follow' = con (cả nhánh) đi theo;
 * 'stay' = con ở lại chỗ cũ, gắn vào thiết bị đến thay (Swap) hoặc cha cũ.
 */
export type ChildrenMode = 'follow' | 'stay';

/** Đang dùng / không dùng — đổi bằng Check-out / Check-in và đổi theo chỗ khi Swap (không phải Status). */
export type Usage = 'in_use' | 'not_in_use';

export type EquipmentRow = Audit & {
  id: string;
  jabil_id: string | null;
  part_number_id: string | null;
  part_number: string | null;
  serial_number: string;
  asset: string | null;
  type_id: string | null;
  type: string | null;
  /** Status của thiết bị: In use / Not in use (hệ thống tự quản; đổi bằng Check-out / Check-in). */
  usage: Usage;
  level_id: string | null;
  level: string | null;
  location_id: string;
  location: string | null;
  remark: string | null;
  tag_ids: string[];
  tags: TagItem[];
  parent_id: string | null;
  parent_serial: string | null;
  has_children: boolean;
};

export type EquipmentTreeNode = {
  id: string; parent_id: string | null; part_number: string | null; serial_number: string;
};

// ------------------------------------------------------------- Calibration
export type DueState = 'overdue' | 'due_soon' | 'ok' | 'none' | 'no_interval';
/** Calibration Status (hệ thống tự tính): chưa có ngày hiệu chuẩn = under_calibration; có ngày thì theo hạn. */
export type CalibrationStatus = 'under_calibration' | 'valid' | 'due_soon' | 'overdue';

export type CalibrationRow = Audit & {
  id: string;
  equipment_id: string;
  serial_number: string;
  part_number: string | null;
  type: string | null;
  location: string | null;
  status: CalibrationStatus;
  vendor_id: string | null;
  vendor: string | null;
  calibration_date: string | null;
  due_date: string | null;
  interval_months: number | null;
  warning_days: number | null;
  due_state: DueState;
  remark: string | null;
  tag_ids: string[];
  tags: TagItem[];
};


// ---------------------------------------------------------- Golden sample
export type GoldenRow = Audit & {
  id: string;
  part_number: string;
  serial_number: string;
  utd_part_number: string | null;
  location_id: string;
  location: string | null;
  origin: string | null;
  purpose: string | null;
  remark: string | null;
  tag_ids: string[];
  tags: TagItem[];
};

// ---------------------------------------------------------- Configuration
export type ConfigList =
  | 'part-numbers' | 'locations' | 'types' | 'tags' | 'levels' | 'departments'
  | 'calibration-setup' | 'calibration-vendors';

export type ConfigRow = Audit & {
  id: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
  description?: string | null;                 // types
  type_id?: string;                            // part-numbers
  usage_needs_parent?: boolean;                // part-numbers
  type?: string | null;                        // part-numbers
  color?: StatusColor;                         // tags
  part_number_id?: string;                     // calibration-setup
  interval_months?: number;                    // calibration-setup
  warning_days?: number;                       // calibration-setup
};

export type ErrorLogRow = {
  id: string; request_id: string; route: string | null; user_id: string | null; user_name: string | null;
  error_code: string | null; message: string | null; stack: string | null; created_at: string;
};

// --------------------------------------------------------- User Management
export type UserRow = Audit & {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  employee_id: string | null;
  department_id: string | null;
  department: string | null;
  role: Role;
  account_status: AccountStatus;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  auth_provider: 'supabase' | 'local';
  must_change_password: boolean;
};

// ----------------------------------------------------------------- Lịch sử
export type HistoryChange = { old: unknown; new: unknown };
export type HistoryEntry = {
  id: string;
  label: string;
  action: string;
  changes: Record<string, HistoryChange>;
  note: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export type HistoryModule = 'equipment' | 'calibration' | 'golden_sample' | 'configuration' | 'user';
/** `item_count` > 1: một lần Import Excel gộp thành một dòng (số dòng của lần import). */
export type RecentActivity = HistoryEntry & { module: HistoryModule; object_id: string; item_count: number };

// ------------------------------------------------------------- Thông báo
export type NotificationType =
  | 'USER_APPROVAL_REQUEST' | 'USER_APPROVED' | 'USER_ROLE_CHANGED' | 'USER_PASSWORD_RESET' | 'USER_PROFILE_UPDATED';
export type NotificationRow = {
  id: string; type: NotificationType; title: string; message: string | null; link: string | null;
  entity_id: string | null; read_at: string | null; created_at: string; created_by_name: string | null;
  /** USER_APPROVAL_REQUEST đã được một admin khác xử lý. */
  handled: boolean;
};

// --------------------------------------------------------------- Dashboard
export type CountItem = { id: string | null; label: string | null; count: number };
/** `id`: khóa Status (in_use / not_in_use; under_calibration / valid / due_soon / overdue) — màn hình dịch ra chữ. */
export type StatusCountItem = CountItem & { color: StatusColor };
export type DashboardData = {
  equipment_total: number;
  golden_total: number;
  calibration_total: number;
  pending_users: number | null;
  /** Số lượng theo Status của Equipment (In use / Not in use) và Calibration (Calibration Status). */
  by_status: Record<StatusPage, StatusCountItem[]>;
  by_location: CountItem[];
  by_type: CountItem[];
  overdue: CalibrationRow[];
  due_soon: CalibrationRow[];
};
