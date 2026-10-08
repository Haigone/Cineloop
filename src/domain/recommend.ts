import type { LibraryEntry, ProviderId, PublicUser, Title, WishlistItem } from "./types";

export type PickReason =
  | { kind: "wishlist" }
  | { kind: "suggested"; by: PublicUser }
  | { kind: "friends-loved"; friends: PublicUser[] }
  | { kind: "friends-want"; friends: PublicUser[] };

export interface TonightPick {
  title: Title;
  reason: PickReason;
  /** Friends who also have it in their wishlist: candidates for watching together. */
  sharedWith: PublicUser[];
  score: number;
}

interface FriendData {
  user: PublicUser;
  library: LibraryEntry[];
  wishlist: WishlistItem[];
}

/**
 * "Da vedere stasera": unseen titles the viewer already wants, boosted when
 * friends loved them or want to see them too. Films get a small boost because
 * they fit in one evening.
 */
export function pickForTonight(input: {
  library: LibraryEntry[];
  wishlist: WishlistItem[];
  friends: FriendData[];
  titles: Map<string, Title>;
  /** Services the viewer pays for: titles available there rank a little higher. */
  subscriptions?: readonly ProviderId[];
  limit: number;
}): TonightPick[] {
  const seen = new Set(input.library.filter((e) => e.status !== "planned").map((e) => e.titleId));
  const candidates = new Map<string, { score: number; wish?: WishlistItem; loved: PublicUser[]; want: PublicUser[] }>();
  const bucket = (id: string) => {
    let c = candidates.get(id);
    if (!c) {
      c = { score: 0, loved: [], want: [] };
      candidates.set(id, c);
    }
    return c;
  };

  for (const w of input.wishlist) {
    if (seen.has(w.titleId)) continue;
    const c = bucket(w.titleId);
    c.wish = w;
    c.score += 3 + Math.max(0, 2 - w.position * 0.25);
  }
  for (const f of input.friends) {
    for (const e of f.library) {
      if (e.status === "completed" && (e.rating ?? 0) >= 8 && !seen.has(e.titleId)) {
        const c = bucket(e.titleId);
        c.loved.push(f.user);
        c.score += 1.5;
      }
    }
    for (const w of f.wishlist) {
      if (seen.has(w.titleId)) continue;
      const c = bucket(w.titleId);
      c.want.push(f.user);
      c.score += 1;
    }
  }

  const picks: TonightPick[] = [];
  for (const [id, c] of candidates) {
    const title = input.titles.get(id);
    if (!title) continue;
    const onMyServices = title.providers.some((p) => input.subscriptions?.includes(p));
    const score = c.score + (title.type === "movie" ? 0.5 : 0) + (onMyServices ? 0.75 : 0);
    const suggestedBy = c.wish?.suggestedBy ? input.friends.find((f) => f.user.id === c.wish!.suggestedBy)?.user : undefined;
    const reason: PickReason = suggestedBy
      ? { kind: "suggested", by: suggestedBy }
      : c.wish
        ? { kind: "wishlist" }
        : c.loved.length >= c.want.length
          ? { kind: "friends-loved", friends: c.loved }
          : { kind: "friends-want", friends: c.want };
    picks.push({ title, reason, sharedWith: c.want, score });
  }
  return picks.sort((a, b) => b.score - a.score || a.title.title.localeCompare(b.title.title)).slice(0, input.limit);
}
