import { z, optText, optId, optDate, reqId } from '@/lib/services/core/validate';

/** Trường user nhập trên Dashboard hiệu chuẩn. Calibration Status do hệ thống tự tính, due_date do database tự tính; thẻ chọn trong phần Remark. */
export const updateSchema = z.object({
  vendor_id: optId,
  calibration_date: optDate,
  remark: optText(1000),
  tag_ids: z.array(reqId).max(50),
}).strict();
