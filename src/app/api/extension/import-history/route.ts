import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { importNetflixHistory } from "@/server/services/import-history";

// The extension reads the CSV on the user's computer and sends only the grouped titles, in small batches.
const item = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["series", "film", "unknown"]),
  season: z.number().int().min(1).max(99).optional(),
  sample: z.string().trim().min(1).max(300),
  // The days it was watched (per day and season, with how many episodes), from the history's dates: no minutes, no CSV.
  watched: z
    .array(z.object({ d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), s: z.number().int().min(1).max(99).optional(), n: z.number().int().min(1).max(60).optional() }))
    .max(400)
    .optional(),
});
const body = z.object({
  // Checked one by one: a row Netflix wrote without a name (": Episodio 1") must not sink its whole batch.
  items: z.array(z.unknown()).min(1).max(20),
  // Sent by extension 0.6.4+: it sends again whatever comes back as pending.
  partial: z.boolean().optional(),
});

export const OPTIONS = preflight;

// Anime lookups (ANN asks for a pause between requests) can make a batch slow: room to answer, and a budget below it.
export const maxDuration = 60;
const BUDGET_MS = 25_000;

/** Titles from the user's Netflix viewing history: the ones missing from the library are added. */
export async function POST(request: NextRequest) {
  // Same budget as the list import: a long history takes several requests in a row.
  const auth = await authenticate(request, 40, "import");
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request, 262_144));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  const items = parsed.data.items.map((i) => item.safeParse(i));
  const valid = items.flatMap((r) => (r.success ? [r.data] : []));
  const unreadable = parsed.data.items
    .filter((_, n) => !items[n]!.success)
    .map((i) => {
      const sample = typeof i === "object" && i && "sample" in i ? String(i.sample).slice(0, 300) : "";
      return { title: sample || "(riga senza nome)", sample };
    });
  if (valid.length === 0) return json(request, { added: [], already: 0, notFound: unreadable, ...(parsed.data.partial ? { pending: [] } : {}) });
  const result = await importNetflixHistory(auth.userId, valid, parsed.data.partial ? BUDGET_MS : undefined);
  return json(request, { ...result, notFound: [...result.notFound, ...unreadable] });
}
