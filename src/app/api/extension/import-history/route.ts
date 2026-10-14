import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { importNetflixHistory } from "@/server/services/import-history";

// The extension reads the CSV on the user's computer and sends only the grouped titles, in small batches.
const body = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["series", "film", "unknown"]),
        season: z.number().int().min(1).max(99).optional(),
        sample: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(20),
});

export const OPTIONS = preflight;

/** Titles from the user's Netflix viewing history: the ones missing from the library are added. */
export async function POST(request: NextRequest) {
  // Same budget as the list import: a long history takes several requests in a row.
  const auth = await authenticate(request, 20, "import");
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request, 32_768));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  return json(request, await importNetflixHistory(auth.userId, parsed.data.items));
}
