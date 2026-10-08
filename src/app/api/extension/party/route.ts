import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { reportPlayback } from "@/server/services/sync";

export const OPTIONS = preflight;

const report = z
  .object({
    externalId: z.string().regex(/^\d{1,12}$/),
    position: z.number().min(0).max(24 * 3600),
    paused: z.boolean(),
    action: z.enum(["play", "pause"]).optional(),
  })
  .strict();

/** The member's player, every couple of seconds while watching together; answers with the room. */
export async function POST(request: NextRequest) {
  // Reports come every 2 seconds plus each play/pause.
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
