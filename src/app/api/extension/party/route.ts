import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { reportPlayback } from "@/server/services/sync";

export const OPTIONS = preflight;

function validExternalId(value: string): boolean {
  if (/^\d{1,12}$/.test(value)) return true;
  // Prime Video: a title id, or "title:<name>" when the player opened without a title page.
  if (/^(?:[A-Z0-9]{10,40}|amzn1\.dv\.gti\.[0-9a-f-]{36})$/.test(value) || /^title:.{1,200}$/.test(value)) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const animeUnity = host === "animeunity.to" || host.endsWith(".animeunity.to");
    return url.protocol === "https:" &&
      animeUnity &&
      /^\/anime\/\d{1,9}(?:[-/?#]|$)/i.test(url.pathname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

const report = z
  .object({
    // Netflix/SC use numeric IDs. AnimeUnity's canonical episode identity is its URL.
    externalId: z.string().max(2048).refine(validExternalId),
    season: z.number().int().min(0).max(999).nullable().optional(),
    episode: z.number().int().min(0).max(9999).nullable().optional(),
    position: z.number().min(0).max(24 * 3600),
    duration: z.number().positive().max(24 * 3600).nullable().optional(),
    paused: z.boolean(),
    action: z.enum(["play", "pause", "seek"]).optional(),
    following: z.boolean().optional(),
  })
  .strict();

/** The member's player, every couple of seconds while watching together; answers with the room. */
export async function POST(request: NextRequest) {
  // Reports come every 2 seconds plus each play/pause/seek.
  const auth = await authenticate(request, 90, "party");
  if (!("userId" in auth)) return auth;
  const parsed = report.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  try {
    return json(request, await reportPlayback(auth.userId, parsed.data));
  } catch (err) {
    console.error("party report failed", err);
    return json(request, { error: "unavailable" }, 500);
  }
}
