/**
 * Error layer — Spec v0.9 mục 35, 36.
 *
 * Quy ước: RPC `raise exception '<ERROR_CODE>'`, service layer bắt và map sang
 * AppError, withAuth biến thành response chuẩn. Không bao giờ để lộ message
 * gốc của Postgres ra client.
 */

export const ERROR_CODES = {
  INVALID_CREDENTIALS: { status: 401, message: 'Username or password is incorrect.' },
  CURRENT_PASSWORD_INCORRECT: { status: 401, message: 'Current password is incorrect.' },
  LOGIN_RATE_LIMITED: { status: 429, message: 'Too many attempts. Please try again shortly.' },
  USERNAME_ALREADY_EXISTS: { status: 409, message: 'This username is already in use.' },
  UNAUTHORIZED:                   { status: 401, message: 'Bạn chưa đăng nhập.' },
  USER_INACTIVE:                  { status: 403, message: 'Tài khoản đã bị vô hiệu hoá. Liên hệ Admin.' },
  FORBIDDEN:                      { status: 403, message: 'Bạn không có quyền thực hiện thao tác này.' },
  VALIDATION_ERROR:               { status: 400, message: 'Dữ liệu gửi lên không hợp lệ.' },
  FIELD_PERMISSION_DENIED:        { status: 403, message: 'Bạn không có quyền sửa một số trường trong yêu cầu này.' },
  EMAIL_ALREADY_EXISTS:           { status: 409, message: 'Email này đã có tài khoản.' },
  USER_NOT_FOUND:                 { status: 404, message: 'Không tìm thấy người dùng.' },
  CANNOT_MODIFY_SELF:             { status: 409, message: 'Không thể tự vô hiệu hoá, tự đổi vai trò hoặc tự đặt lại mật khẩu của chính mình tại đây.' },
  LAST_ADMIN:                     { status: 409, message: 'Phải còn ít nhất một quản trị viên đang hoạt động.' },
  PASSWORD_CHANGE_REQUIRED:       { status: 403, message: 'Bạn cần đổi mật khẩu trước khi tiếp tục.' },
  EQUIPMENT_NOT_FOUND:            { status: 404, message: 'Không tìm thấy thiết bị.' },
  EQUIPMENT_ARCHIVED:             { status: 409, message: 'Thiết bị đã được archive.' },
  EQUIPMENT_NOT_ARCHIVED:         { status: 409, message: 'Thiết bị chưa được archive.' },
  PARENT_NOT_FOUND:               { status: 404, message: 'Không tìm thấy thiết bị cha.' },
  PARENT_CYCLE_DETECTED:          { status: 409, message: 'Thao tác này tạo ra vòng lặp trong cây thiết bị.' },
  MOVE_TARGET_ARCHIVED:           { status: 409, message: 'Không thể gắn vào một thiết bị đã archive.' },
  DEPTH_LIMIT_EXCEEDED:           { status: 409, message: 'Cây thiết bị vượt quá 50 tầng. Dữ liệu có thể đang bị lỗi — báo Admin.' },
  LOCATION_REQUIRED:              { status: 400, message: 'Cần chọn Location.' },
  REMARK_REQUIRED_FOR_STATUS:     { status: 400, message: 'Trạng thái này bắt buộc phải có Remark.' },
  LOCATION_INHERITED_READ_ONLY:   { status: 409, message: 'Thiết bị này đang có Parent nên Location tự động theo Parent. Dùng Move, Swap hoặc Detach để đổi.' },
  OPTIMISTIC_CONFLICT:            { status: 409, message: 'Dữ liệu đã bị người khác thay đổi. Vui lòng tải lại trước khi sửa tiếp.' },
  LOCK_TIMEOUT:                   { status: 409, message: 'Có người đang thao tác trên nhánh thiết bị này. Vui lòng thử lại sau vài giây.' },
  ARCHIVE_BLOCKED_HAS_CHILDREN:   { status: 409, message: 'Không archive được vì còn thiết bị con chưa archive. Hãy archive hoặc detach các con trước.' },
  SWAP_INVALID:                   { status: 400, message: 'Không thể swap hai thiết bị này.' },
  SWAP_INVALID_ANCESTOR_RELATION: { status: 409, message: 'Không thể swap hai thiết bị có quan hệ cha–con.' },
  DUPLICATE_WARNING:              { status: 200, message: 'Cảnh báo: đã có thiết bị khác cùng Part Number và Serial Number.' },
  SERVER_ERROR:                   { status: 500, message: 'Lỗi hệ thống. Vui lòng thử lại hoặc báo Admin kèm mã yêu cầu.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, details: Record<string, unknown> = {}) {
    super(ERROR_CODES[code].message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_CODES[this.code].status;
  }
}

/** Mã lỗi Postgres → ErrorCode. */
const PG_STATE: Record<string, ErrorCode> = {
  '55P03': 'LOCK_TIMEOUT',            // lock_not_available
  '40P01': 'LOCK_TIMEOUT',            // deadlock_detected
  '57014': 'LOCK_TIMEOUT',            // query_canceled (statement_timeout)
  '23505': 'VALIDATION_ERROR',        // unique_violation
  '23503': 'VALIDATION_ERROR',        // foreign_key_violation
  '23514': 'VALIDATION_ERROR',        // check_violation
  '23502': 'VALIDATION_ERROR',        // not_null_violation
};

type PgLikeError = { message?: string; code?: string; details?: string | null };

/**
 * RPC raise exception '<ERROR_CODE>' → message chính là mã lỗi.
 * Mọi thứ không nhận ra đều thành SERVER_ERROR (không rò rỉ nội dung ra client).
 */
export function mapRpcError(error: PgLikeError | null): AppError {
  if (!error) return new AppError('SERVER_ERROR');

  const raw = (error.message ?? '').trim();
  if (raw in ERROR_CODES) return new AppError(raw as ErrorCode);

  if (error.code && PG_STATE[error.code]) {
    return new AppError(PG_STATE[error.code]!);
  }

  return new AppError('SERVER_ERROR', { pg: raw.slice(0, 200) });
}
