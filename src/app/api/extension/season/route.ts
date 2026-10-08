import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { setSeason } from "@/server/services/sync";

const body = z.object({ season: z.number().int().min(0).max(200) });

export const OPTIONS = preflight;

/** The user picked the season of the episode on screen. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  const status = await setSeason(auth.userId, parsed.data.season);
  return status ? json(request, status) : json(request, { error: "not_watching" }, 409);
}
