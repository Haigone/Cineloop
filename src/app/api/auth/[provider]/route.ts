import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, callbackUrl, isOAuthProvider, newOAuthState, OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE } from "@/server/auth/oauth";

/** "Continua con Google / Discord": sends the browser to the provider, remembering where to come back to. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]">) {
  const { provider } = await ctx.params;
  if (!isOAuthProvider(provider)) return NextResponse.redirect(new URL("/login", request.url));
  const { state, verifier } = newOAuthState();
  const url = authorizeUrl(provider, callbackUrl(provider, request.nextUrl.origin), state, verifier);
  if (!url) return NextResponse.redirect(new URL("/login?accesso=non-attivo", request.url));

  const next = request.nextUrl.searchParams.get("next") ?? "";
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ provider, state, verifier, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return response;
}
