import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { importNetflixList } from "@/server/services/import-list";

// The popup sends the list in small batches, so each request stays short.
const body = z.object({
  items: z
    // No id when the list comes from Netflix's data export (MyList.csv has names only).
    .array(z.object({ id: z.string().regex(/^\d{1,12}$/).optional(), title: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(20),
  // Sent by extension 0.6.4+: it sends again whatever comes back as pending.
  partial: z.boolean().optional(),
});

export const OPTIONS = preflight;

// Anime lookups (ANN asks for a pause between requests) can make a batch slow: room to answer, and a budget below it.
export const maxDuration = 60;
const BUDGET_MS = 25_000;

/** Titles from the user's own "La mia lista" on Netflix (its page or its data export): they go to the wishlist. */
export async function POST(request: NextRequest) {
  // Its own budget: a long list takes several requests in a row.
  const auth = await authenticate(request, 40, "import");
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request, 32_768));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  return json(request, await importNetflixList(auth.userId, parsed.data.items, parsed.data.partial ? BUDGET_MS : undefined));
}
