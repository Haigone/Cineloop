import "server-only";
import { italianDay } from "@/lib/dates";
import { listNewSeasons, type NewSeasonItem } from "./new-seasons";
import type { LibraryItem } from "@/domain/library";
import { sectionOf, type LibraryEntry, type PublicUser, type RatingValue, type Title, type WatchStatus } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getProvider } from "@/domain/providers";
import { getAdapter } from "@/integrations/providers/registry";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { cacheTitles, ensureTitle } from "./explore";
import { loadFriendBundles } from "./shared";

export interface LibraryView {
  items: LibraryItem[];
  wishlistIds: string[];
  newSeasons: NewSeasonItem[];
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
    newSeasons: await listNewSeasons(repo, entries, titles, italianDay()),
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
  /** All the offers in Italy, rentals included (JustWatch through TMDB), when the catalogue has the title. */
  offersUrl: string | null;
  /** For an anime: its other series and the films made from it. */
  related: Title[];
}

/** Returns null when the title does not exist (the page renders not-found). */
export async function getTitleView(id: string): Promise<TitleView | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  // Catalog titles are fetched and cached on first view.
  const title = await ensureTitle(id);
  if (!title) return null;
  const [library, wishlist, friends, related] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    sectionOf(title) === "anime" ? getCatalog().related(title, 12).catch(() => []) : Promise.resolve([]),
  ]);
  // Cached so their cards open like any other title.
  if (related.length) await cacheTitles(repo, related);
  const tmdb = /^tmdb-(movie|tv)-(\d+)$/.exec(title.id);

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
    offersUrl: tmdb ? `https://www.themoviedb.org/${tmdb[1]}/${tmdb[2]}/watch?locale=IT` : null,
    related,
  };
}
