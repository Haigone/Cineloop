import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { getCatalog } from "@/integrations/catalog";
import { parseAnimeList } from "@/integrations/anime/ann";
import { parseFillerEpisodes } from "@/integrations/anime/filler-list";
import { italianDay } from "@/lib/dates";

/** What one source answered: enough to see why it is not working, never any content or secrets. */
async function probe(url: string, read: (body: string) => unknown) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CineLoop/1.0 (personal watch tracker)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const body = await res.text();
    return { url, status: res.status, ms: Date.now() - started, bytes: body.length, ...(res.ok ? { result: read(body) } : {}) };
  } catch (err) {
    return { url, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

/**
 * Signed-in users only. Checks, from the server, that the anime sources and the
 * release list answer as CineLoop expects: open /api/diagnostics/sources while logged in.
 */
export async function GET() {
  if (!(await getOptionalUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const catalog = getCatalog();
  const today = italianDay();
  const upcoming = await catalog.upcoming("all", today, 20).catch((err) => ({ error: String(err) }));
  const [annSearch, annById, filler] = await Promise.all([
    probe("https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=~bleach", (b) => {
      const list = parseAnimeList(b);
      return { entries: list.length, first: list.slice(0, 5).map((e) => [e.id, e.type, e.name, e.start, e.episodes, e.related.length]) };
    }),
    probe("https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=4658", (b) => {
      const list = parseAnimeList(b);
      return { entries: list.length, related: list[0]?.related ?? [] };
    }),
    probe("https://www.animefillerlist.com/shows/bleach", (b) => ({ fillerEpisodes: parseFillerEpisodes(b).length })),
  ]);
  return NextResponse.json({
    catalogue: { name: catalog.name, complete: catalog.complete, tmdbTokenSet: Boolean(process.env.TMDB_READ_TOKEN), animeSources: process.env.ANIME_SOURCES !== "off" },
    today,
    upcoming: Array.isArray(upcoming)
      ? { total: upcoming.length, streaming: upcoming.filter((r) => r.venue !== "cinema").length, cinema: upcoming.filter((r) => r.venue === "cinema").length }
      : upcoming,
    sources: { annSearch, annById, fillerList: filler },
  });
}
