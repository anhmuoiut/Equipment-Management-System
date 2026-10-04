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
/** Trang có cột trạng thái (Dashboard đếm theo từng trang). Một danh sách trạng thái chung cho mọi trang. */
export type StatusPage = 'equipment' | 'calibration' | 'golden_sample';
/** 5 màu hệ thống của trạng thái (statuses.color) — mã màu ở globals.css. */
export type StatusColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray';
export type StatusOption = {
  id: string; display_name: string; sort_order: number;
  requires_remark: boolean; color: StatusColor;
};
export type Options = {
  part_numbers: OptionItem[];
  locations: OptionItem[];
  types: OptionItem[];
  levels: OptionItem[];
  departments: OptionItem[];
  calibration_vendors: OptionItem[];
  statuses: StatusOption[];
};

// --------------------------------------------------------------- Equipment
/**
 * Thiết bị có con khi di chuyển / xóa: 'follow' = con (cả nhánh) đi theo;
 * 'stay' = con ở lại chỗ cũ, gắn vào thiết bị đến thay (Swap) hoặc cha cũ.
 */
export type ChildrenMode = 'follow' | 'stay';

export type EquipmentRow = Audit & {
  id: string;
  jabil_id: string | null;
  part_number_id: string | null;
  part_number: string | null;
  serial_number: string;
  asset: string | null;
  type_id: string | null;
  type: string | null;
  status_id: string | null;
  status: string | null;
  status_color: StatusColor | null;
  level_id: string | null;
  level: string | null;
  location_id: string;
  location: string | null;
  remark: string | null;
  parent_id: string | null;
  parent_serial: string | null;
  has_children: boolean;
};

export type EquipmentTreeNode = {
  id: string; parent_id: string | null; part_number: string | null; serial_number: string;
};

// ------------------------------------------------------------- Calibration
export type DueState = 'overdue' | 'due_soon' | 'ok' | 'none' | 'no_interval';

export type CalibrationRow = Audit & {
  id: string;
  equipment_id: string;
  serial_number: string;
  part_number: string | null;
  type: string | null;
  location: string | null;
  status_id: string | null;
  status: string | null;
  status_color: StatusColor | null;
  vendor_id: string | null;
  vendor: string | null;
  calibration_date: string | null;
  due_date: string | null;
  interval_months: number | null;
  warning_days: number | null;
  due_state: DueState;
  remark: string | null;
};


// ---------------------------------------------------------- Golden sample
export type GoldenRow = Audit & {
  id: string;
  part_number: string;
  serial_number: string;
  utd_part_number: string | null;
  location_id: string;
  location: string | null;
  status_id: string | null;
  status: string | null;
  status_color: StatusColor | null;
  origin: string | null;
  purpose: string | null;
  remark: string | null;
};

// ---------------------------------------------------------- Configuration
export type ConfigList =
  | 'part-numbers' | 'locations' | 'types' | 'statuses' | 'levels' | 'departments'
  | 'calibration-setup' | 'calibration-vendors';

export type ConfigRow = Audit & {
  id: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
  description?: string | null;                 // types
  requires_remark?: boolean;                   // statuses
  color?: StatusColor;                         // statuses
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
export type StatusCountItem = CountItem & { color: StatusColor | null };
export type DashboardData = {
  equipment_total: number;
  golden_total: number;
  calibration_total: number;
  pending_users: number | null;
  /** Số lượng theo trạng thái của từng trang dùng trạng thái. */
  by_status: Record<StatusPage, StatusCountItem[]>;
  by_location: CountItem[];
  by_type: CountItem[];
  overdue: CalibrationRow[];
  due_soon: CalibrationRow[];
};
