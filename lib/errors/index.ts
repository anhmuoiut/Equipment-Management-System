/**
 * Error layer.
 *
 * Quy ước: database `raise exception '<ERROR_CODE>'`, service bắt và đổi sang
 * AppError, withAuth biến thành response chuẩn. Không để lộ message gốc của
 * Postgres ra client. Chữ hiển thị cho người dùng nằm ở src/i18n/locales
 * (mục "errors") — message ở đây chỉ để ghi log.
 */

export const ERROR_CODES = {
  INVALID_CREDENTIALS:            { status: 401, message: 'Username or password is incorrect.' },
  CURRENT_PASSWORD_INCORRECT:     { status: 401, message: 'Current password is incorrect.' },
  LOGIN_RATE_LIMITED:             { status: 429, message: 'Too many attempts.' },
  ACCOUNT_PENDING:                { status: 403, message: 'Account is waiting for approval.' },
  USER_INACTIVE:                  { status: 403, message: 'Account is not active.' },
  UNAUTHORIZED:                   { status: 401, message: 'Not signed in.' },
  FORBIDDEN:                      { status: 403, message: 'Not allowed.' },
  PASSWORD_CHANGE_REQUIRED:       { status: 403, message: 'Password change required.' },
  VALIDATION_ERROR:               { status: 400, message: 'Invalid data.' },
  NOT_FOUND:                      { status: 404, message: 'Record not found.' },
  DUPLICATE_VALUE:                { status: 409, message: 'Value already exists.' },
  IN_USE:                         { status: 409, message: 'Record is in use.' },
  USERNAME_ALREADY_EXISTS:        { status: 409, message: 'Username already exists.' },
  EMAIL_ALREADY_EXISTS:           { status: 409, message: 'Email already exists.' },
  USER_NOT_FOUND:                 { status: 404, message: 'User not found.' },
  CANNOT_MODIFY_SELF:             { status: 409, message: 'Cannot change own role / status / password here.' },
  LAST_ADMIN:                     { status: 409, message: 'At least one active admin is required.' },
  ACCOUNT_NOT_PENDING:            { status: 409, message: 'Account is not pending.' },
  EQUIPMENT_NOT_FOUND:            { status: 404, message: 'Equipment not found.' },
  EQUIPMENT_HAS_NO_PARENT:        { status: 409, message: 'Equipment has no parent.' },
  PARENT_NOT_FOUND:               { status: 404, message: 'Parent not found.' },
  PARENT_CYCLE_DETECTED:          { status: 409, message: 'Would create a loop.' },
  LOCATION_INHERITED_READ_ONLY:   { status: 409, message: 'Location follows the parent.' },
  REMARK_REQUIRED_FOR_STATUS:     { status: 400, message: 'Status requires a remark.' },
  SWAP_INVALID:                   { status: 400, message: 'Cannot swap.' },
  SWAP_INVALID_ANCESTOR_RELATION: { status: 409, message: 'Cannot swap parent and child.' },
  SWAP_NO_CHANGE:                 { status: 409, message: 'Swap would change nothing.' },
  STATUS_NOT_ALLOWED:             { status: 400, message: 'Status not enabled for this page.' },
  STATUS_IN_USE:                  { status: 409, message: 'Status is in use on that page.' },
  INACTIVE_OPTION:                { status: 400, message: 'Selected value is hidden.' },
  ALREADY_IN_CALIBRATION:         { status: 409, message: 'Equipment already on the calibration dashboard.' },
  CALIBRATION_INTERVAL_MISSING:   { status: 400, message: 'Part number has no calibration interval.' },
  CALIBRATION_INTERVAL_IN_USE:    { status: 409, message: 'Interval in use.' },
  LOCK_TIMEOUT:                   { status: 409, message: 'Busy, try again.' },
  SERVER_ERROR:                   { status: 500, message: 'Server error.' },
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
  '55P03': 'LOCK_TIMEOUT',      // lock_not_available
  '40P01': 'LOCK_TIMEOUT',      // deadlock_detected
  '57014': 'LOCK_TIMEOUT',      // query_canceled
  '23505': 'DUPLICATE_VALUE',   // unique_violation
  '23503': 'IN_USE',            // foreign_key_violation (xóa dòng đang được dùng)
  '23514': 'VALIDATION_ERROR',  // check_violation
  '23502': 'VALIDATION_ERROR',  // not_null_violation
  '22P02': 'VALIDATION_ERROR',  // invalid_text_representation (uuid sai…)
  '22007': 'VALIDATION_ERROR',  // invalid_datetime_format
};

type PgLikeError = { message?: string; code?: string; details?: string | null };

/** `raise exception '<ERROR_CODE>'` → chính mã đó; còn lại theo SQLSTATE; không nhận ra → SERVER_ERROR. */
export function mapRpcError(error: PgLikeError | null): AppError {
  if (!error) return new AppError('SERVER_ERROR');
  const raw = (error.message ?? '').trim();
  if (raw in ERROR_CODES) return new AppError(raw as ErrorCode, error.details ? { detail: error.details } : {});
  if (error.code && PG_STATE[error.code]) return new AppError(PG_STATE[error.code]!);
  // PostgREST không tìm thấy hàm / bảng: database chưa chạy đủ file trong database/.
  if (error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42883' || error.code === '42P01') {
    return new AppError('SERVER_ERROR', {
      pg: raw.slice(0, 200),
      hint: 'Database is missing functions or tables — run database/02_schema.sql and database/04_functions.sql (see database/README.md).',
    });
  }
  return new AppError('SERVER_ERROR', { pg: raw.slice(0, 200) });
}
