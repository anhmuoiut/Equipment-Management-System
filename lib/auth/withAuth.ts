import 'server-only';

/**
 * withAuth — Spec v0.9 mục 3c.
 *
 * Đây là ràng buộc cấu trúc quan trọng nhất của hệ thống.
 *
 * service_role bypass RLS hoàn toàn, nên RLS KHÔNG bảo vệ được rủi ro lớn nhất
 * là "quên check quyền trong một route". Biện pháp thật là: không route nào
 * được export handler trần — mọi handler phải đi qua đây và phải KHAI BÁO
 * role/action nó yêu cầu.
 *
 *   export const POST = withAuth(handler, { role: ['admin','user'], action: 'move' });
 *
 * Kiểm tra định kỳ (checklist mở pilot, mục 55.8):
 *   grep -rLn "withAuth" app/api --include=route.ts
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError, type ErrorCode } from '@/lib/errors';
import { getCurrentSession } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertPermission, type PermissionCode, type Role, type UserProfile } from '@/lib/permissions';

export type AuthContext = {
  requestId: string;
  profile: UserProfile;
  params: Record<string, string>;
};

type Options = {
  /** Role được phép. Mặc định: cả 3 role đã đăng nhập. */
  role?: readonly Role[];
  /** Permission catalog code bắt buộc (mục 32). Admin luôn bypass. */
  action?: PermissionCode | string;
  /** Chỉ dùng cho /api/health. Mọi route nghiệp vụ đều phải xác thực. */
  allowAnonymous?: true;
};

type Handler = (
  req: NextRequest,
  ctx: AuthContext,
) => Promise<NextResponse> | NextResponse;

/** Response chuẩn (mục 35). */
export function ok<T>(data: T, requestId: string, meta: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, data, meta: { ...meta, request_id: requestId } });
}

export function fail(err: AppError, requestId: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    },
    { status: err.status },
  );
}

async function logError(
  requestId: string,
  route: string,
  userId: string | null,
  code: ErrorCode,
  message: string,
  stack?: string,
) {
  // Log Vercel Hobby chỉ giữ ~1 giờ (mục 47d) — đây là nơi điều tra lỗi user
  // báo lại sau. Bản thân việc ghi log không bao giờ được làm hỏng response.
  try {
    await supabaseAdmin().from('error_log').insert({
      request_id: requestId,
      route,
      user_id: userId,
      error_code: code,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000) ?? null,
    });
  } catch {
    console.error(`[${requestId}] không ghi được error_log`);
  }
}

export function withAuth(handler: Handler, options: Options = {}) {
  // Chữ ký phải khớp RouteContext của Next 15: `params` KHÔNG được optional,
  // kể cả với route tĩnh (khi đó nó là Promise<{}>).
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const requestId = `req_${crypto.randomUUID()}`;
    const route = `${req.method} ${new URL(req.url).pathname}`;
    let userId: string | null = null;

    try {
      const params = (await routeCtx?.params) ?? {};

      if (options.allowAnonymous) {
        return await handler(req, {
          requestId,
          params,
          profile: null as unknown as UserProfile,
        });
      }

      // 1. Session — Supabase Auth cookie, or (for auth_provider = 'local'
      //    accounts, which have no Supabase Auth row) our own signed cookie.
      const session = await getCurrentSession();
      if (!session) throw new AppError('UNAUTHORIZED');
      userId = session.userId;

      // 2. Profile + permission grants — hai query song song thay vì một, vì
      //    V2 tách permission ra bảng riêng (catalog mở rộng được). Cả hai
      //    đều là lookup theo user_id đã index sẵn, chi phí không đáng kể.
      const db = supabaseAdmin();
      const [{ data: profile, error: profErr }, { data: grants, error: grantsErr }] = await Promise.all([
        db.from('user_profiles')
          .select('id, full_name, email, username, role, is_active, must_change_password, token_version')
          .eq('id', userId)
          .maybeSingle<Omit<UserProfile, 'permissions'> & { token_version: number }>(),
        db.from('user_permissions').select('permission_code').eq('user_id', userId),
      ]);

      if (profErr || grantsErr) throw new AppError('SERVER_ERROR', { stage: 'load_profile' });
      if (!profile) throw new AppError('UNAUTHORIZED');

      // 2a. A local-account cookie signed before the last password change
      //     (reset or self-service) must not still work.
      if (session.tokenVersion !== null && session.tokenVersion !== profile.token_version) {
        throw new AppError('UNAUTHORIZED');
      }

      // 3. Tài khoản bị deactivate không thao tác được dù session cũ còn hạn.
      if (!profile.is_active) throw new AppError('USER_INACTIVE');

      // 4. Role
      if (options.role && !options.role.includes(profile.role)) {
        throw new AppError('FORBIDDEN', { required_role: options.role });
      }

      const fullProfile: UserProfile = { ...profile, permissions: (grants ?? []).map((g) => g.permission_code) };

      // 5. Action permission
      if (options.action) assertPermission(fullProfile, options.action);

      return await handler(req, { requestId, profile: fullProfile, params });
    } catch (e) {
      if (e instanceof AppError) {
        if (e.status >= 500) {
          await logError(requestId, route, userId, e.code, e.message, JSON.stringify(e.details));
        }
        return fail(e, requestId);
      }

      const err = e as Error;
      console.error(`[${requestId}] ${route}`, err);
      await logError(requestId, route, userId, 'SERVER_ERROR', err?.message ?? 'unknown', err?.stack);
      return fail(new AppError('SERVER_ERROR'), requestId);
    }
  };
}
