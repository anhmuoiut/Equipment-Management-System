/**
 * Import Excel cho Golden sample — các cột của file (server đọc / kiểm tra,
 * sinh file mẫu; giao diện báo lỗi theo cột). Giới hạn, báo cáo và loại lỗi
 * dùng chung với Equipment (lib/equipmentImport.ts).
 */
import type { ImportColumn } from './equipmentImport';

export type GoldenImportColumnKey =
  | 'part_number' | 'serial_number' | 'utd_part_number' | 'location_id' | 'status_id' | 'origin' | 'purpose' | 'remark';

export type GoldenImportListKey = 'locations' | 'statuses';

export type GoldenImportColumn = ImportColumn<GoldenImportColumnKey> & { list?: GoldenImportListKey };

/** Các cột của file, theo thứ tự form Thêm golden sample; độ dài như app/api/golden/schema.ts. */
export const GOLDEN_IMPORT_COLUMNS: readonly GoldenImportColumn[] = [
  { key: 'part_number', header: 'Part number', required: true, max: 200, width: 22 },
  { key: 'serial_number', header: 'Serial number', required: true, max: 200, width: 24 },
  { key: 'utd_part_number', header: 'UTD part number', max: 200, width: 22 },
  { key: 'location_id', header: 'Location', required: true, list: 'locations', page: 'Location', width: 20 },
  { key: 'status_id', header: 'Status', required: true, list: 'statuses', page: 'Status', width: 20 },
  { key: 'origin', header: 'Origin', max: 200, width: 20 },
  { key: 'purpose', header: 'Purpose', max: 500, width: 36 },
  { key: 'remark', header: 'Remark', max: 1000, width: 44 },
];
