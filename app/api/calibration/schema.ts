import { z, optText, optId, optDate } from '@/lib/services/core/validate';

/** Trường user nhập trên Dashboard hiệu chuẩn. Trạng thái là của thiết bị (sửa ở Equipment); due_date do database tự tính. */
export const updateSchema = z.object({
  vendor_id: optId,
  calibration_date: optDate,
  remark: optText(1000),
}).strict();
