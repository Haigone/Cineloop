import "server-only";
import { italianDay } from "@/lib/dates";
import { listNewSeasons, type NewSeasonItem } from "./new-seasons";
import type { LibraryItem } from "@/domain/library";
import { sectionOf, type LibraryEntry, type PublicUser, type RatingValue, type Title, type WatchStatus } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getProvider } from "@/domain/providers";
import { getAdapter } from "@/integrations/providers/registry";
import { providerSearchUrl } from "@/integrations/providers/search-links";
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
  watchChoices: { id: "netflix" | "animeunity"; name: string; tint: string; url: string }[];
  friends: { user: PublicUser; status: WatchStatus | "wishlist"; rating: RatingValue | null }[];
  allFriends: PublicUser[];
  offersUrl: string | null;
  related: Title[];
}

export async function getTitleView(id: string): Promise<TitleView | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const title = await ensureTitle(id);
  if (!title) return null;
  const [library, wishlist, friends, related] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    sectionOf(title) === "anime" ? getCatalog().related(title, 12).catch(() => []) : Promise.resolve([]),
  ]);
  if (related.length) await cacheTitles(repo, related);
  const tmdb = /^tmdb-(movie|tv)-(\d+)$/.exec(title.id);

  const friendRows: TitleView["friends"] = [];
  for (const f of friends) {
    const e = f.library.find((x) => x.titleId === id);
    if (e) friendRows.push({ user: f.user, status: e.status, rating: e.rating });
    else if (f.wishlist.some((w) => w.titleId === id)) friendRows.push({ user: f.user, status: "wishlist", rating: null });
  }

  // Anime pages always offer an Anime Unity shortcut. If playback has already
  // been observed, the progress entry instead opens the exact saved page.
  const providerIds = [...new Set([...title.providers, ...(title.type === "anime" ? ["animeunity" as const] : []), ...(sectionOf(title) !== "anime" ? ["streamingcommunity" as const] : [])])];
  return {
    title,
    entry: library.find((e) => e.titleId === id) ?? null,
    wishlisted: wishlist.some((w) => w.titleId === id),
    watchChoices: sectionOf(title) === "anime" ? (["netflix", "animeunity"] as const).map((pid) => {
      const p = getProvider(pid)!;
      return { id: pid, name: p.name, tint: p.tint, url: providerSearchUrl(pid, title.title)! };
    }) : [],
    providers: providerIds.map((pid) => {
      const p = getProvider(pid)!;
      return {
        id: p.id,
        name: p.name,
        tint: p.tint,
        url: pid === "animeunity" || pid === "netflix" || pid === "streamingcommunity"
          ? providerSearchUrl(pid, title.title)
          : getAdapter(pid).getContentUrl({ providerId: pid, externalId: null, title: title.title, type: title.type, season: null, episode: null, titleId: id }),
      };
    }),
    friends: friendRows,
    allFriends: friends.map((f) => f.user),
    offersUrl: tmdb ? `https://www.themoviedb.org/${tmdb[1]}/${tmdb[2]}/watch?locale=IT` : null,
    related,
  };
}
