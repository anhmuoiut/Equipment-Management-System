import { z, childrenMode, optText, optId, reqText, reqId } from '@/lib/services/core/validate';

/** Trường trên form thiết bị — docs/DATABASE_MODIFIED.md mục 2. */
const fields = {
  serial_number: reqText(200),
  jabil_id: optText(200),
  part_number_id: optId,
  asset: optText(200),
  type_id: optId,
  level_id: optId,
  status_id: optId,
  location_id: reqId,
  remark: optText(1000),
};

/** Thiết bị cha (thêm và sửa): có cha thì vị trí theo cha (không cần location_id); null = không có cha. */
export const createSchema = z.object({ ...fields, location_id: optId, parent_id: optId }).strict();
/** Sửa: `children_mode` — thiết bị có con đổi cha / vị trí: con đi theo hay ở lại chỗ cũ. */
export const updateSchema = z.object({ ...fields, parent_id: optId, children_mode: childrenMode }).partial().strict();
