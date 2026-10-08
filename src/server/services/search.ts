import "server-only";
import type { MediaType, User } from "@/domain/types";
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
  const [titles, people, friends] = await Promise.all([
    repo.searchTitles(q, 6),
    repo.searchUsers(q, 4),
    repo.listFriends(viewer.id),
  ]);
  const friendIds = new Set(friends.map((f) => f.user.id));
  return {
    titles: titles.map((t) => ({ id: t.id, title: t.title, year: t.year, type: t.type, palette: t.artwork.palette })),
    people: people
      .filter((p) => p.id !== viewer.id)
      .map((p) => ({ id: p.id, username: p.username, displayName: p.displayName, isFriend: friendIds.has(p.id) })),
  };
}
