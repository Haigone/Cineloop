import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { reportPlayback } from "@/server/services/sync";

export const OPTIONS = preflight;

const report = z
  .object({
    // A Netflix /watch id, a Prime Video title id, or "title:<name>" when Prime
    // Video's player was opened without a title page.
    externalId: z.union([z.string().regex(/^\d{1,12}$/), z.string().regex(/^(?:[A-Z0-9]{10,40}|amzn1\.dv\.gti\.[0-9a-f-]{36})$/), z.string().regex(/^title:.{1,200}$/)]),
    season: z.number().int().min(0).max(999).nullable().optional(),
    episode: z.number().int().min(0).max(9999).nullable().optional(),
    position: z.number().min(0).max(24 * 3600),
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
