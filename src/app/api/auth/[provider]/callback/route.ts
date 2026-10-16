import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { callbackUrl, fetchOAuthProfile, isOAuthProvider, OAUTH_COOKIE, resolveOAuthUser } from "@/server/auth/oauth";
import { createSession, destroySession } from "@/server/auth/session";
import { getRepository } from "@/server/data";

/** The provider sends the browser back here with a one-time code: sign in (or link) and go on. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  const { provider } = await ctx.params;
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const saved = readSaved(jar.get(OAUTH_COOKIE)?.value);
  jar.delete({ name: OAUTH_COOKIE, path: "/api/auth" });

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?accesso=${reason}`, request.url));
  if (!isOAuthProvider(provider) || !saved || saved.provider !== provider) return fail("errore");
  // Closed the provider's page or said no.
  if (params.get("error")) return fail("annullato");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !sameString(state, saved.state)) return fail("errore");

  try {
    const profile = await fetchOAuthProfile(provider, code, callbackUrl(provider, request.nextUrl.origin), saved.verifier);
    const viewer = await getOptionalUser();
    const outcome = await resolveOAuthUser(getRepository(), profile, viewer);
    if (!outcome.ok) {
      return outcome.reason === "no_email"
        ? fail("senza-email")
        : NextResponse.redirect(new URL("/settings?accesso=gia-collegato#account", request.url));
    }
    // A fresh regular session, also replacing a guest's year-long one.
    if (viewer) await destroySession();
    await createSession(outcome.user.id);
    const destination = outcome.created ? "/welcome" : safeNext(saved.next || (viewer ? "/settings#account" : "/home"));
    return NextResponse.redirect(new URL(destination, request.url));
  } catch (err) {
    console.error(`${provider} sign-in failed`, err);
    return fail("errore");
  }
}

function readSaved(raw: string | undefined): { provider: string; state: string; verifier: string; next: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v?.provider === "string" && typeof v.state === "string" && typeof v.verifier === "string"
      ? { provider: v.provider, state: v.state, verifier: v.verifier, next: typeof v.next === "string" ? v.next : "" }
      : null;
  } catch {
    return null;
  }
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only same-site relative paths. */
function safeNext(s: string): string {
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/home";
}
