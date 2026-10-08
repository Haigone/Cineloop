import "server-only";
import type { LibraryItem } from "@/domain/library";
import type { LibraryEntry, PublicUser, RatingValue, Title, WatchStatus } from "@/domain/types";
import { getProvider } from "@/domain/providers";
import { getAdapter } from "@/integrations/providers/registry";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "./explore";
import { loadFriendBundles } from "./shared";

export interface LibraryView {
  items: LibraryItem[];
  wishlistIds: string[];
}

export async function getLibraryView(): Promise<LibraryView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [entries, wishlist] = await Promise.all([repo.listLibrary(viewer.id), repo.listWishlist(viewer.id)]);
  const titles = new Map((await repo.getTitlesByIds(entries.map((e) => e.titleId))).map((t) => [t.id, t]));
  return {
    // Older "planned" entries are plans, which belong to the wishlist, not here.
    items: entries.filter((e) => e.status !== "planned" && titles.has(e.titleId)).map((entry) => ({ entry, title: titles.get(entry.titleId)! })),
    wishlistIds: wishlist.map((w) => w.titleId),
  };
}

export interface TitleView {
  title: Title;
  entry: LibraryEntry | null;
  wishlisted: boolean;
  providers: { id: string; name: string; tint: string; url: string | null }[];
  friends: { user: PublicUser; status: WatchStatus | "wishlist"; rating: RatingValue | null }[];
  /** Every friend, for "Consiglia a un amico". */
  allFriends: PublicUser[];
}

/** Returns null when the title does not exist (the page renders not-found). */
export async function getTitleView(id: string): Promise<TitleView | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  // Catalog titles are fetched and cached on first view.
  const title = await ensureTitle(id);
  if (!title) return null;
  const [library, wishlist, friends] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
  ]);

  const friendRows: TitleView["friends"] = [];
  for (const f of friends) {
    const e = f.library.find((x) => x.titleId === id);
    if (e) friendRows.push({ user: f.user, status: e.status, rating: e.rating });
    else if (f.wishlist.some((w) => w.titleId === id)) friendRows.push({ user: f.user, status: "wishlist", rating: null });
  }

  return {
    title,
    entry: library.find((e) => e.titleId === id) ?? null,
    wishlisted: wishlist.some((w) => w.titleId === id),
    providers: title.providers.map((pid) => {
      const p = getProvider(pid)!;
      return {
        id: p.id,
        name: p.name,
        tint: p.tint,
        url: getAdapter(pid).getContentUrl({ providerId: pid, externalId: null, title: title.title, type: title.type, season: null, episode: null, titleId: id }),
      };
    }),
    friends: friendRows,
    allFriends: friends.map((f) => f.user),
  };
}
