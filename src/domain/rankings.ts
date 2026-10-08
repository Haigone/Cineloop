import type { Genre, LibraryEntry, MediaType, PublicUser, Title, WishlistItem } from "./types";

export interface RankedTitle {
  title: Title;
  value: number;
}

/** The viewer's best titles of a type, by their own rating. */
export function topRated(library: LibraryEntry[], titles: Map<string, Title>, type: MediaType, limit: number): RankedTitle[] {
  return library
    .filter((e) => e.rating != null && titles.get(e.titleId)?.type === type)
    .sort((a, b) => b.rating! - a.rating! || Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
    .slice(0, limit)
    .map((e) => ({ title: titles.get(e.titleId)!, value: e.rating! }));
}

/** Count of ratings per star value (1–10). */
export function ratingDistribution(library: LibraryEntry[]): number[] {
  const out = Array.from({ length: 10 }, () => 0);
  for (const e of library) if (e.rating) out[e.rating - 1]!++;
  return out;
}

export function genreShares(profile: Map<Genre, number>, limit: number): { genre: Genre; share: number }[] {
  const total = [...profile.values()].reduce((s, v) => s + v, 0) || 1;
  return [...profile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, v]) => ({ genre, share: v / total }));
}

interface FriendLists {
  user: PublicUser;
  library: LibraryEntry[];
  wishlist: WishlistItem[];
}

export interface SocialRankings {
  mostWatched: (RankedTitle & { friends: PublicUser[] })[];
  bestRated: (RankedTitle & { votes: number })[];
  mostShared: (RankedTitle & { friends: PublicUser[] })[];
}

export function socialRankings(friends: FriendLists[], titles: Map<string, Title>, limit: number): SocialRankings {
  const watched = new Map<string, PublicUser[]>();
  const ratings = new Map<string, number[]>();
  const wanted = new Map<string, PublicUser[]>();
  for (const f of friends) {
    for (const e of f.library) {
      if (e.status === "completed" || e.status === "watching") watched.set(e.titleId, [...(watched.get(e.titleId) ?? []), f.user]);
      if (e.rating) ratings.set(e.titleId, [...(ratings.get(e.titleId) ?? []), e.rating]);
    }
    for (const w of f.wishlist) wanted.set(w.titleId, [...(wanted.get(w.titleId) ?? []), f.user]);
  }
  const ranked = <T,>(m: Map<string, T>, score: (v: T) => number, min: (v: T) => boolean, extra: (v: T) => object) =>
    [...m.entries()]
      .filter(([id, v]) => titles.has(id) && min(v))
      .map(([id, v]) => ({ title: titles.get(id)!, value: score(v), ...extra(v) }))
      .sort((a, b) => b.value - a.value || a.title.title.localeCompare(b.title.title, "it"))
      .slice(0, limit);

  return {
    mostWatched: ranked(watched, (v) => v.length, (v) => v.length >= 2, (v) => ({ friends: v })) as SocialRankings["mostWatched"],
    bestRated: ranked(
      ratings,
      (v) => v.reduce((s, x) => s + x, 0) / v.length,
      (v) => v.length >= 2,
      (v) => ({ votes: v.length }),
    ) as SocialRankings["bestRated"],
    mostShared: ranked(wanted, (v) => v.length, (v) => v.length >= 2, (v) => ({ friends: v })) as SocialRankings["mostShared"],
  };
}
