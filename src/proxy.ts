import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cineloop_session";
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Optimistic auth gate: only checks that a session cookie exists, so it stays
 * cheap. The real check (token lookup, expiry) happens in the data access
 * layer on every server read and action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/" && pathname !== "/home") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
