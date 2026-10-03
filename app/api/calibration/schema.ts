import { z, optText, optId, optDate } from '@/lib/services/core/validate';

/** Trường user nhập trên Dashboard hiệu chuẩn. due_date do database tự tính. */
export const updateSchema = z.object({
  status_id: optId,
  vendor_id: optId,
  calibration_date: optDate,
  remark: optText(1000),
}).strict();
