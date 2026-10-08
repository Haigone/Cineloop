import type { Genre, LibraryEntry, PublicUser, Title, WatchPartyFilter, WishlistItem } from "./types";

export interface PartyMember {
  user: PublicUser;
  library: LibraryEntry[];
  wishlist: WishlistItem[];
}

export interface PartyCandidate {
  title: Title;
  /** Members who have it in their wishlist. */
  wantedBy: PublicUser[];
  /** 0–1: share of the group that wants it. */
  match: number;
}

/**
 * Titles the whole group can watch together: nobody has seen them yet, and at
 * least one member wants to. "common" keeps only titles wanted by at least
 * half of the group.
 */
export function compatibleTitles(input: {
  members: PartyMember[];
  titles: Title[];
  filter: WatchPartyFilter;
  genre: Genre | null;
}): PartyCandidate[] {
  const { members } = input;
  if (members.length === 0) return [];
  const seen = new Set<string>();
  for (const m of members) for (const e of m.library) if (e.status === "completed" || e.status === "watching") seen.add(e.titleId);

  const wanted = new Map<string, PublicUser[]>();
  for (const m of members) {
    for (const w of m.wishlist) {
      const list = wanted.get(w.titleId) ?? [];
      list.push(m.user);
      wanted.set(w.titleId, list);
    }
  }

  const threshold = Math.ceil(members.length / 2);
  const out: PartyCandidate[] = [];
  for (const title of input.titles) {
    if (seen.has(title.id)) continue;
    const wantedBy = wanted.get(title.id) ?? [];
    if (wantedBy.length === 0) continue;
    if (input.filter === "common" && (members.length < 2 ? wantedBy.length < 1 : wantedBy.length < threshold)) continue;
    if (input.filter === "movie" && title.type !== "movie") continue;
    if (input.filter === "series" && title.type !== "series") continue;
    if (input.filter === "anime" && title.type !== "anime") continue;
    if (input.genre && !title.genres.includes(input.genre)) continue;
    out.push({ title, wantedBy, match: wantedBy.length / members.length });
  }
  return out.sort((a, b) => b.match - a.match || (b.title.communityRating ?? 0) - (a.title.communityRating ?? 0));
}

/** Uniform random pick; injectable RNG keeps it testable. */
export function pickWinner<T>(items: readonly T[], random: () => number = Math.random): number {
  if (items.length === 0) return -1;
  return Math.min(items.length - 1, Math.floor(random() * items.length));
}
