import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCAL_SESSION_COOKIE, verifyLocalSession } from '@/lib/auth/localSession';

/**
 * Middleware chỉ làm hai việc: refresh session cookie và redirect khi chưa
 * đăng nhập. Middleware KHÔNG chứa logic phân quyền — logic đó nằm ở withAuth
 * để chỉ có một nơi duy nhất quyết định quyền.
 *
 * "Logged in" here also accepts a valid local-account session cookie
 * (auth_provider = 'local' accounts have no Supabase Auth session at all).
 * This only checks the cookie's signature and expiry — not account_status or
 * whether the password has changed since (token_version) — the same way
 * this middleware never re-checked those for Supabase sessions either. The
 * authoritative check is always withAuth / the server layouts, on every
 * request.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;
  const isLogin = pathname.startsWith('/login');

  const hasLocalSession = !data.user &&
    !!(await verifyLocalSession(req.cookies.get(LOCAL_SESSION_COOKIE)?.value));
  const isLoggedIn = !!data.user || hasLocalSession;

  if (!isLoggedIn && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Public static files under public/ (banner/logo images, etc.) are served
  // at the site root with no auth of their own — if the matcher doesn't
  // exclude them too, an unauthenticated request for one gets redirected to
  // /login and the browser tries to render that HTML as the image, which is
  // exactly the failure mode of a broken image on the login page itself.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico)$).*)'],
};
