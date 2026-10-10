import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getOptionalUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { getCatalog } from "@/integrations/catalog";
import { ANIME_ID } from "@/integrations/anime/franchise";
import { searchKey } from "@/lib/text";

export const maxDuration = 60;

/**
 * Signed-in only. Replaces the anime that came from TMDB (tmdb-* ids, type anime) by the franchise
 * cards of the anime sources, for every profile: libraries, wishlists, activity and links follow.
 *
 *   /api/diagnostics/anime-reset            shows what would change, changes nothing
 *   /api/diagnostics/anime-reset?apply=1    does it
 *   &after=<id>                              continues from where the last answer stopped
 *
 * A title with no clear match in the anime sources is left as it is.
 */
export async function GET(request: Request) {
  if (!(await getOptionalUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.ANIME_SOURCES === "off") return NextResponse.json({ error: "anime sources are off" }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const apply = params.get("apply") === "1";
  const after = params.get("after") ?? "";
  const repo = getRepository();
  const catalog = getCatalog();

  const todo = (await repo.listTitles())
    .filter((t) => t.type === "anime" && t.id.startsWith("tmdb-") && t.id > after)
    .sort((a, b) => a.id.localeCompare(b.id));
  const started = Date.now();
  const changes: { from: string; fromId: string; to: string; toId: string; moved?: number; merged?: number }[] = [];
  const unmatched: string[] = [];
  let last = after;
  let stopped = false;

  for (const old of todo) {
    if (Date.now() - started > 45_000) {
      stopped = true;
      break;
    }
    last = old.id;
    const key = searchKey(old.title);
    const hit = (await catalog.search(old.title, 6).catch(() => [])).find((t) => {
      if (!ANIME_ID.test(t.id)) return false;
      const k = searchKey(t.title);
      return k === key || k.startsWith(key) || key.startsWith(k);
    });
    if (!hit) {
      unmatched.push(`${old.title} (${old.id})`);
      continue;
    }
    const entry: (typeof changes)[number] = { from: old.title, fromId: old.id, to: hit.title, toId: hit.id };
    if (apply) Object.assign(entry, await repo.replaceTitle(old.id, hit));
    changes.push(entry);
  }
  if (apply && changes.length) revalidatePath("/", "layout");
  return NextResponse.json({
    mode: apply ? "applied" : "dry run (add ?apply=1 to change)",
    changes,
    unmatched,
    ...(stopped ? { next: `/api/diagnostics/anime-reset?${apply ? "apply=1&" : ""}after=${encodeURIComponent(last)}` } : { done: true }),
  });
}
