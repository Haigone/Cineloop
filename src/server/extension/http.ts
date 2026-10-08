import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/server/data";

/**
 * Shared plumbing for the browser extension's API: token auth, CORS for
 * extension origins only, and a small per-key rate limit.
 *
 * The extension authenticates with its own bearer token (never the site's
 * session cookie), so allowing extension origins does not expose anything a
 * web page could use.
 */

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension):\/\/[a-z0-9-]+$/i;

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(request: NextRequest, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(request), "Cache-Control": "no-store" } });
}

export function preflight(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

// Rate limiting: a fixed window per key, per server instance. Good enough to
// stop a runaway extension or code guessing; not a distributed quota.
const windows = new Map<string, { start: number; count: number }>();

export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start > windowMs) windows.delete(k);
    }
    return false;
  }
  w.count += 1;
  return w.count > limit;
}

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export type ExtensionAuth = { userId: string; deviceId: string };

/**
 * Resolves the extension token, or returns the response to send instead
 * (401 when missing or revoked, 429 when over the limit). `bucket` keeps the
 * frequent watch-together reports from eating the limit of everything else.
 */
export async function authenticate(request: NextRequest, limit = 30, bucket = "api"): Promise<ExtensionAuth | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header)?.[1];
  if (!token) return json(request, { error: "unauthorized" }, 401);
  const hash = hashSecret(token);
  if (rateLimited(`${bucket}:token:${hash}`, limit)) return json(request, { error: "rate_limited" }, 429);
  const auth = await getRepository().useExtensionToken(hash);
  if (!auth) return json(request, { error: "unauthorized" }, 401);
  return auth;
}

/** Reads a JSON body up to a small size, or null. */
export async function readJson(request: NextRequest, maxBytes = 4096): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
