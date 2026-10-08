import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { endPresence, setPartyUrl } from "@/server/services/sync";

export const OPTIONS = preflight;

/** The user stopped watching (tab closed or navigated away). */
export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  await endPresence(auth.userId);
  return json(request, { ok: true });
}

const patch = z.object({ partyUrl: z.string().max(500).nullable() });

/** Shares or clears a watch-together room link. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  const parsed = patch.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  const res = await setPartyUrl(auth.userId, parsed.data.partyUrl);
  return json(request, res, res.ok ? 200 : 400);
}
