import type { NextRequest } from "next/server";
import { z } from "zod";
import { PROVIDERS } from "@/domain/providers";
import type { ProviderId } from "@/domain/types";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { handleObservation } from "@/server/services/sync";

const observation = z.object({
  providerId: z.enum(Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]]),
  url: z.string().url().max(500),
  documentTitle: z.string().max(300),
  hints: z
    .object({
      title: z.string().max(200).optional(),
      season: z.number().int().min(0).max(200).optional(),
      episode: z.number().int().min(0).max(5000).optional(),
      progress: z.number().min(0).max(1).optional(),
      parentId: z.string().regex(/^\d{1,12}$/).optional(),
    })
    .strict()
    .optional(),
  observedAt: z.string().datetime(),
});

export const OPTIONS = preflight;

/** A heartbeat from the tab the user is watching in. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  const parsed = observation.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  try {
    return json(request, await handleObservation(auth.userId, parsed.data));
  } catch (err) {
    console.error("extension observation failed", err);
    return json(request, { error: "unavailable" }, 500);
  }
}
