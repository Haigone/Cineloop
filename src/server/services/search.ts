import "server-only";
import type { MediaType, Title, User } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getRepository } from "@/server/data";
import { withoutSeriesFilms } from "@/domain/franchise";
import type { PersonHit } from "@/integrations/catalog/types";
import { namesPerson, searchKey } from "@/lib/text";
import { cacheTitles, canonical } from "./explore";

export interface SearchResults {
  titles: { id: string; title: string; year: number; type: MediaType; palette: readonly [string, string, string]; posterUrl: string | null }[];
  /** Actors and directors: each opens their whole filmography. */
  cast: { id: string; name: string; role: string | null; photoUrl: string | null; knownFor: string[] }[];
  people: { id: string; username: string; displayName: string; isFriend: boolean }[];
}

/**
 * Unified search across the catalog and people. Kept behind one function so
 * new result groups (cast, lists) can be added without touching the UI.
 */
export async function search(viewer: User, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { titles: [], cast: [], people: [] };
  const repo = getRepository();
  const [local, people, friends, cast] = await Promise.all([
    repo.searchTitles(q, 6),
    repo.searchUsers(q, 4),
    repo.listFriends(viewer.id),
    searchCast(q, 3),
  ]);
  const titles = await withCast(await withRemote(local, q, 6), cast, q, 6);
  const friendIds = new Set(friends.map((f) => f.user.id));
  return {
    titles: titles.map((t) => ({ id: t.id, title: t.title, year: t.year, type: t.type, palette: t.artwork.palette, posterUrl: t.artwork.posterUrl })),
    cast: cast.map((p) => ({ id: p.id, name: p.name, role: p.role, photoUrl: p.photoUrl, knownFor: p.knownFor.map((t) => t.title) })),
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
    // A franchise from the anime sources stands for its series and films: the copies cached from TMDB
    // on earlier searches (series, parts, films) would show it twice.
    const folded = found.some((t) => t.id.startsWith("anime-ann-"));
    const kept = folded ? local.filter((t) => t.type !== "anime" && !(t.type === "movie" && t.partOf)) : local;
    const merged = [...found.filter((t) => t.id.startsWith("anime-ann-")), ...kept.map((t) => fresh.get(t.id) ?? t), ...found.filter((t) => !t.id.startsWith("anime-ann-") && !kept.some((l) => l.id === t.id))];
    // One row per title: a bundled copy and the catalogue's copy of the same film are the same row.
    const repo = getRepository();
    const one = await canonical(repo, withoutSeriesFilms(merged));
    await cacheTitles(repo, one.filter((t) => t.artwork.posterUrl));
    return one.slice(0, limit);
  } catch (err) {
    console.error("catalog search failed", err);
    return withoutSeriesFilms(local);
  }
}

/** Actors and directors by name. A remote failure never breaks search. */
export async function searchCast(q: string, limit: number): Promise<PersonHit[]> {
  try {
    return await getCatalog().searchPeople(q, limit);
  } catch (err) {
    console.error("people search failed", err);
    return [];
  }
}

/**
 * When the query is an actor's or director's name, their best-known titles come
 * first among the titles (a title literally named like the query stays on top).
 */
async function withCast(titles: Title[], cast: PersonHit[], q: string, limit: number): Promise<Title[]> {
  const named = cast.find((p) => namesPerson(q, p.name));
  if (!named || named.knownFor.length === 0) return titles;
  const key = searchKey(q);
  const exact = titles.filter((t) => searchKey(t.title) === key);
  const merged = [...exact, ...named.knownFor, ...titles.filter((t) => !exact.includes(t))];
  const seen = new Set<string>();
  const one = (await canonical(getRepository(), merged)).filter((t) => !seen.has(t.id) && seen.add(t.id));
  return one.slice(0, limit);
}
