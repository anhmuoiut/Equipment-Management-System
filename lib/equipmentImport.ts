/**
 * Import Excel cho Equipment — phần dùng chung server (đọc / kiểm tra file,
 * sinh file mẫu) và giao diện (báo lỗi theo cột). docs/DETAIL_MODEL.md mục 2.
 */

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_FILE_MB = 5;

export type ImportColumnKey =
  | 'serial_number' | 'part_number_id' | 'jabil_id' | 'asset' | 'type_id'
  | 'level_id' | 'status_id' | 'location_id' | 'parent_serial' | 'parent_part_number' | 'remark';

/** Danh sách Configuration mà cột chọn từ đó. */
export type ImportListKey = 'part_numbers' | 'types' | 'levels' | 'statuses' | 'locations';

export type ImportColumn = {
  key: ImportColumnKey;
  /** Tiêu đề cột trong file. Đổi chữ này thì file đã tải trước đó không nhận ra cột. */
  header: string;
  required?: boolean;
  /** Bắt buộc, trừ khi dòng có thiết bị cha (Location: theo cha). */
  requiredUnlessParent?: boolean;
  /** Cột chữ: số ký tự tối đa (như form Thêm thiết bị). */
  max?: number;
  /** Cột chọn: danh sách Configuration + tên trang Configuration tương ứng. */
  list?: ImportListKey;
  page?: string;
  /** Bề rộng cột trong file mẫu. */
  width: number;
};

/**
 * Các cột của file, theo thứ tự form Thêm thiết bị (docs/DATABASE_MODIFIED.md mục 2).
 * Thiết bị cha: tìm theo serial (thiết bị đã có hoặc dòng khác trong file);
 * part number cha chỉ cần khi serial đó trùng ở nhiều thiết bị.
 */
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'serial_number', header: 'Serial number', required: true, max: 200, width: 24 },
  { key: 'part_number_id', header: 'Part number', list: 'part_numbers', page: 'Part Number', width: 22 },
  { key: 'jabil_id', header: 'Jabil ID', max: 200, width: 16 },
  { key: 'asset', header: 'Asset', max: 200, width: 16 },
  { key: 'type_id', header: 'Type', list: 'types', page: 'Type', width: 18 },
  { key: 'level_id', header: 'Level', list: 'levels', page: 'Level', width: 16 },
  { key: 'status_id', header: 'Status', list: 'statuses', page: 'Status', width: 20 },
  { key: 'location_id', header: 'Location', requiredUnlessParent: true, list: 'locations', page: 'Location', width: 20 },
  { key: 'parent_serial', header: 'Parent serial number', max: 200, width: 24 },
  { key: 'parent_part_number', header: 'Parent part number', list: 'part_numbers', page: 'Part Number', width: 22 },
  { key: 'remark', header: 'Remark', max: 1000, width: 44 },
];

export type ImportIssueCode =
  | 'required' | 'too_long' | 'not_found' | 'inactive' | 'status_not_allowed' | 'remark_required'
  | 'parent_not_found' | 'parent_ambiguous' | 'parent_cycle' | 'location_follows_parent';

/**
 * Lỗi của một ô. `value`: chữ trong ô (remark_required: tên trạng thái;
 * location_follows_parent: vị trí của thiết bị cha). `count`: parent_ambiguous.
 */
export type ImportIssue = { column: ImportColumnKey; code: ImportIssueCode; value?: string; max?: number; count?: number };

export type ImportRowReport = {
  /** Số dòng trong Excel. */
  row: number;
  serial_number: string | null;
  issues: ImportIssue[];
  /** Serial trùng (chỉ cảnh báo): 'existing' = đã có trong hệ thống, số = dòng trước đó trong file. */
  duplicate_of: 'existing' | number | null;
};

export type ImportReport = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  committed: boolean;
  created: number;
  /** Cột có trong file nhưng không nhận ra (bỏ qua). */
  ignored_columns: string[];
  /** Chỉ các dòng có lỗi hoặc cảnh báo. */
  rows: ImportRowReport[];
};

/** Lỗi cả file: AppError VALIDATION_ERROR, details.fields.file = mã này (+ count / max / columns). */
export type ImportFileError = 'required' | 'too_large' | 'not_xlsx' | 'unreadable' | 'empty' | 'too_many_rows' | 'missing_columns';
