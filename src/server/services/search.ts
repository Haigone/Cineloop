import "server-only";
import type { MediaType, Title, User } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getRepository } from "@/server/data";

export interface SearchResults {
  titles: { id: string; title: string; year: number; type: MediaType; palette: readonly [string, string, string] }[];
  people: { id: string; username: string; displayName: string; isFriend: boolean }[];
}

/**
 * Unified search across the catalog and people. Kept behind one function so
 * new result groups (cast, lists) can be added without touching the UI.
 */
export async function search(viewer: User, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { titles: [], people: [] };
  const repo = getRepository();
  const [local, people, friends] = await Promise.all([
    repo.searchTitles(q, 6),
    repo.searchUsers(q, 4),
    repo.listFriends(viewer.id),
  ]);
  const titles = await withRemote(local, q, 6);
  const friendIds = new Set(friends.map((f) => f.user.id));
  return {
    titles: titles.map((t) => ({ id: t.id, title: t.title, year: t.year, type: t.type, palette: t.artwork.palette })),
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
  if (catalog.name === "demo" || local.length >= limit) return local;
  try {
    const remote = (await catalog.search(q, limit)).filter((t) => !local.some((l) => l.id === t.id));
    if (remote.length) await getRepository().upsertTitles(remote);
    return [...local, ...remote].slice(0, limit);
  } catch (err) {
    console.error("catalog search failed", err);
    return local;
  }
}
