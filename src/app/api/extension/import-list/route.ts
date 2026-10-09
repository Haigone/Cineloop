import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { importNetflixList } from "@/server/services/import-list";

// The popup sends the list in small batches, so each request stays short.
const body = z.object({
  items: z
    .array(z.object({ id: z.string().regex(/^\d{1,12}$/), title: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(20),
});

export const OPTIONS = preflight;

/** Titles from the user's own "La mia lista" page on Netflix: they go to the wishlist. */
export async function POST(request: NextRequest) {
  // Its own budget: a long list takes several requests in a row.
  const auth = await authenticate(request, 20, "import");
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  return json(request, await importNetflixList(auth.userId, parsed.data.items));
}
