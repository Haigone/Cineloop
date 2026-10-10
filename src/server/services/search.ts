import "server-only";
import type { MediaType, Title, User } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getRepository } from "@/server/data";
import { withoutSeriesFilms } from "@/domain/franchise";
import { cacheTitles } from "./explore";
import { searchAniDbAnime } from "@/integrations/catalog/anidb-first";

export interface SearchResults {
  titles: { id: string; title: string; year: number; type: MediaType; posterUrl: string | null; palette: readonly [string, string, string] }[];
  anime: { id: string; anidbId: number; title: string; year: number | null; format: string | null; posterUrl: string | null }[];
  people: { id: string; username: string; displayName: string; isFriend: boolean }[];
}

/**
 * Unified search across the catalog and people. Kept behind one function so
 * new result groups (cast, lists) can be added without touching the UI.
 */
export async function search(viewer: User, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { titles: [], anime: [], people: [] };
  const repo = getRepository();
  const [local, people, friends, anime] = await Promise.all([
    repo.searchTitles(q, 6),
    repo.searchUsers(q, 4),
    repo.listFriends(viewer.id),
    searchAniDbAnime(q, 5),
  ]);
  const titles = (await withRemote(local.filter((title) => title.type !== "anime"), q, 6)).filter((title) => title.type !== "anime");
  const friendIds = new Set(friends.map((f) => f.user.id));
  return {
    titles: titles.map((t) => ({ id: t.id, title: t.title, year: t.year, type: t.type, posterUrl: t.artwork.posterUrl, palette: t.artwork.palette })),
    anime: anime.map((item) => ({ id: item.id, anidbId: item.anidbId, title: item.title, year: item.year, format: item.format, posterUrl: item.posterUrl })),
    people: people
      .filter((p) => p.id !== viewer.id)
      .map((p) => ({ id: p.id, username: p.username, displayName: p.displayName, isFriend: friendIds.has(p.id) })),
  };
}

/**
 * Tops up local results from the remote catalog (TMDB) and caches what it
 * finds, so titles can be added to lists. A remote failure never breaks search.
 */
async function withRemote(local: Title[], q: string, limit: number): Promise<Title[]> {
  const catalog = getCatalog();
  if (catalog.name === "demo") return withoutSeriesFilms(local);
  try {
    const found = await catalog.search(q, limit);
    if (found.length) await cacheTitles(getRepository(), found);
    // The catalogue's copy is fresher (it knows which films come from a series); one row per title.
    const fresh = new Map(found.map((t) => [t.id, t]));
    const merged = [...local.map((t) => fresh.get(t.id) ?? t), ...found.filter((t) => !local.some((l) => l.id === t.id))];
    return withoutSeriesFilms(merged).slice(0, limit);
  } catch (err) {
    console.error("catalog search failed", err);
    return withoutSeriesFilms(local);
  }
}
