import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { confirmTitle } from "@/server/services/sync";

const body = z.object({ titleId: z.string().min(1).max(120), parentId: z.string().regex(/^\d{1,12}$/).nullable().optional() });

export const OPTIONS = preflight;

/** The user told us what they are watching. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  const status = await confirmTitle(auth.userId, parsed.data.titleId, parsed.data.parentId ?? null);
  return status ? json(request, status) : json(request, { error: "not_watching" }, 409);
}
