import type { Genre, LibraryEntry, PublicUser, Title, WatchPartyFilter, WishlistItem } from "./types";

/** The minimum the matcher needs per person: serialisable, so it can run in the browser. */
export interface PartyMember {
  user: PublicUser;
  /** Titles already watched or in progress. */
  seenIds: string[];
  wantedIds: string[];
}

export function toPartyMember(user: PublicUser, library: LibraryEntry[], wishlist: WishlistItem[]): PartyMember {
  return {
    user,
    seenIds: library.filter((e) => e.status === "completed" || e.status === "watching").map((e) => e.titleId),
    wantedIds: wishlist.map((w) => w.titleId),
  };
}

export interface PartyCandidate {
  title: Title;
  /** Members who have it in their wishlist. */
  wantedBy: PublicUser[];
  /** 0–1: share of the group that wants it. */
  match: number;
}

/** Where a member's wanted titles can come from: the whole wishlist, or one of their playlists. */
export interface PartySource {
  /** "<userId>:wishlist" or "<userId>:<playlistId>". */
  key: string;
  ownerId: string;
  kind: "wishlist" | "playlist";
  label: string;
  titleIds: string[];
}

export const sourceKey = (ownerId: string, what: string) => `${ownerId}:${what}`;

/** What a member brings to the evening: the union of the sources picked for them. */
export function wantedFrom(ownerId: string, sources: readonly PartySource[], picked: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const s of sources) if (s.ownerId === ownerId && picked.has(s.key)) for (const id of s.titleIds) ids.add(id);
  return [...ids];
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
  /** Overrides "common" in `filter`, so a kind (film, serie, anime) and "common only" can be combined. */
  commonOnly?: boolean;
}): PartyCandidate[] {
  const { members } = input;
  if (members.length === 0) return [];
  const seen = new Set(members.flatMap((m) => m.seenIds));
  const wanted = new Map<string, PublicUser[]>();
  for (const m of members) {
    for (const id of m.wantedIds) {
      const list = wanted.get(id) ?? [];
      list.push(m.user);
      wanted.set(id, list);
    }
  }

  const threshold = Math.ceil(members.length / 2);
  const common = input.commonOnly ?? input.filter === "common";
  const out: PartyCandidate[] = [];
  for (const title of input.titles) {
    if (seen.has(title.id)) continue;
    const wantedBy = wanted.get(title.id) ?? [];
    if (wantedBy.length === 0) continue;
    if (common && (members.length < 2 ? wantedBy.length < 1 : wantedBy.length < threshold)) continue;
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

/**
 * The pieces shown on a wheel that cannot hold every candidate: the winner, plus a random handful of the
 * others, shuffled. The winner was drawn from all the candidates, so the sample never changes the odds.
 */
export function wheelSample<T>(all: readonly T[], winnerIndex: number, max: number, random: () => number = Math.random): { items: T[]; index: number } {
  if (all.length <= max) return { items: [...all], index: winnerIndex };
  const others = all.filter((_, i) => i !== winnerIndex);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const items = others.slice(0, max - 1);
  const index = Math.min(items.length, Math.floor(random() * max));
  items.splice(index, 0, all[winnerIndex]!);
  return { items, index };
}
