import { z, optText, optId, reqText, reqId } from '@/lib/services/core/validate';

/** Trường golden sample — docs/DATABASE_MODIFIED.md mục 4. */
const fields = {
  part_number: reqText(200),
  serial_number: reqText(200),
  utd_part_number: optText(200),
  location_id: reqId,
  status_id: optId,
  origin: optText(200),
  purpose: optText(500),
  remark: optText(1000),
};

export const createSchema = z.object(fields).strict();
export const updateSchema = z.object(fields).partial().strict();
