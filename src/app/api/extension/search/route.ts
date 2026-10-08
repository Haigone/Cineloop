import type { NextRequest } from "next/server";
import { authenticate, json, preflight } from "@/server/extension/http";
import { searchForExtension } from "@/server/services/sync";

export const OPTIONS = preflight;

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  try {
    return json(request, { titles: await searchForExtension(request.nextUrl.searchParams.get("q") ?? "") });
  } catch (err) {
    console.error("extension search failed", err);
    return json(request, { titles: [] });
  }
}
