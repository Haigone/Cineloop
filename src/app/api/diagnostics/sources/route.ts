import { NextResponse } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { getCatalog } from "@/integrations/catalog";
import { AnnClient, parseAnimeList } from "@/integrations/anime/ann";
import { buildFranchise, collectEntries } from "@/integrations/anime/franchise";
import { FillerList, parseFillerEpisodes } from "@/integrations/anime/filler-list";
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
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await getOptionalUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const catalog = getCatalog();
  const today = italianDay();
  const upcoming = await catalog.upcoming("all", today, 20).catch((err) => ({ error: String(err) }));
  const [annSearch, annById, filler, mal] = await Promise.all([
    probe("https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=~bleach", (b) => {
      const list = parseAnimeList(b);
      return { entries: list.length, all: list.slice(0, 15).map((e) => [e.id, e.type, e.name, e.start, e.episodes, e.related.map((r) => `${r.rel}:${r.id}`)]) };
    }),
    probe("https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=4658", (b) => {
      const list = parseAnimeList(b);
      return { entries: list.length, related: list[0]?.related ?? [] };
    }),
    probe("https://www.animefillerlist.com/shows/bleach", (b) => ({
      fillerEpisodes: parseFillerEpisodes(b).length,
      rows: (b.match(/<tr\b/gi) ?? []).length,
      // The first two table rows as the page writes them, to see which markup the parser must read.
      sample: [...b.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].slice(0, 3).map((m) => m[0].replace(/\s+/g, " ").slice(0, 500)),
    })),
    probe("https://api.jikan.moe/v4/seasons/upcoming?sfw=true&limit=25", (b) => {
      const data = (JSON.parse(b) as { data?: { mal_id: number; title?: string; type?: string; status?: string; aired?: { from?: string | null } }[] }).data ?? [];
      return { records: data.length, sample: data.slice(0, 8).map((a) => [a.mal_id, a.title, a.type, a.status, a.aired?.from?.slice(0, 10) ?? null]) };
    }),
  ]);
  // End to end: the franchise the way the site builds it from one entry (?seed=25066), when asked for.
  const params = new URL(request.url).searchParams;
  // ?q=name runs the site's own search, so what comes back is what the search box would show.
  const q = params.get("q")?.trim().slice(0, 80);
  let search: unknown = undefined;
  if (q && q.length >= 2) {
    try {
      const found = await catalog.search(q, 10);
      search = found.map((t) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        year: t.year,
        seasons: t.type === "movie" ? undefined : t.seasons.map((s) => [s.number, s.episodeCount, s.name ?? null]),
        order: t.type === "movie" ? undefined : t.watchOrder?.map((p) => [p.kind, p.name, p.year, p.episodes, p.canon, p.filler?.length ?? 0]),
      }));
    } catch (err) {
      search = { error: String(err) };
    }
  }
  const seed = params.get("seed");
  let franchise: unknown = undefined;
  if (seed && /^\d{1,8}$/.test(seed)) {
    try {
      const ann = new AnnClient();
      const root = (await ann.byIds([seed]))[0];
      const known = root ? [root, ...(await ann.search(root.name))] : [];
      const built = await buildFranchise(await collectEntries([seed], ann, known), new FillerList());
      franchise = built && {
        id: built.title.id,
        title: built.title.title,
        seasons: built.title.seasons,
        order: built.title.watchOrder?.map((p) => [p.kind, p.name, p.year, p.episodes, p.canon, p.filler?.length ?? 0]),
      };
    } catch (err) {
      franchise = { error: String(err) };
    }
  }
  return NextResponse.json({
    search,
    franchise,
    catalogue: { name: catalog.name, complete: catalog.complete, tmdbTokenSet: Boolean(process.env.TMDB_READ_TOKEN), animeSources: process.env.ANIME_SOURCES !== "off" },
    today,
    upcoming: Array.isArray(upcoming)
      ? { total: upcoming.length, streaming: upcoming.filter((r) => r.venue === "streaming").length, cinema: upcoming.filter((r) => r.venue === "cinema").length, seasonal: upcoming.filter((r) => r.venue === "seasonal").length }
      : upcoming,
    sources: { annSearch, annById, fillerList: filler, myAnimeList: mal },
  });
}
