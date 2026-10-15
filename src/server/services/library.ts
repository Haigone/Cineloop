import "server-only";
import { italianDay } from "@/lib/dates";
import { awaitedReleases, type AwaitedRelease } from "./awaited";
import { listNewSeasons, type NewSeasonItem } from "./new-seasons";
import { wantsUpdates, type LibraryItem } from "@/domain/library";
import { sectionOf, type LibraryEntry, type PublicUser, type RatingValue, type Title, type WatchStatus } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getProvider } from "@/domain/providers";
import { getAdapter, resolveContinueUrl } from "@/integrations/providers/registry";
import { providerSearchUrl } from "@/integrations/providers/search-links";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { cacheTitles, ensureTitle } from "./explore";
import { animeUnityResumeUrl, loadFriendBundles } from "./shared";
import { listSharedWatchViews, type SharedWatchView } from "./shared-watch";

export interface LibraryView {
  items: LibraryItem[];
  wishlistIds: string[];
  newSeasons: NewSeasonItem[];
  /** Series finished or being watched with a season or an episode still to come, soonest first. */
  awaiting: { title: Title; release: AwaitedRelease }[];
}

export interface LibraryExtras {
  awaiting: { title: Title; release: AwaitedRelease }[];
  newSeasons: NewSeasonItem[];
}

/** The library itself comes straight from the database; Novità and In attesa ask outside services and arrive after it. */
export async function getLibraryView(): Promise<Omit<LibraryView, "awaiting" | "newSeasons"> & { extras: Promise<LibraryExtras> }> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [entries, wishlist] = await Promise.all([repo.listLibrary(viewer.id), repo.listWishlist(viewer.id)]);
  const titles = new Map((await repo.getTitlesByIds(entries.map((e) => e.titleId))).map((t) => [t.id, t]));
  // Finished or still being watched: either way, something scheduled to come out is worth waiting for.
  // The catalogue is asked about 30 at most, so what is being watched goes first.
  const followed = entries
    .filter((e) => (e.status === "completed" || e.status === "watching") && wantsUpdates(e) && titles.has(e.titleId))
    .sort((a, b) => Number(b.status === "watching") - Number(a.status === "watching"))
    .map((e) => titles.get(e.titleId)!);
  const extras = Promise.all([awaitedReleases(followed, italianDay()), listNewSeasons(repo, entries, titles, italianDay())])
    .then(([awaited, newSeasons]) => ({
      awaiting: followed
        .flatMap((title) => (awaited.has(title.id) ? [{ title, release: awaited.get(title.id)! }] : []))
        .sort((a, b) => (a.release.date ?? "9999").localeCompare(b.release.date ?? "9999")),
      newSeasons,
    }))
    .catch((): LibraryExtras => ({ awaiting: [], newSeasons: [] }));
  return {
    items: entries.filter((e) => e.status !== "planned" && titles.has(e.titleId)).map((entry) => ({ entry, title: titles.get(entry.titleId)! })),
    wishlistIds: wishlist.map((w) => w.titleId),
    extras,
  };
}

export interface TitleView {
  title: Title;
  entry: LibraryEntry | null;
  wishlisted: boolean;
  providers: { id: string; name: string; tint: string; url: string | null; /** Where "Continua a guardare" goes, same as on Home; only for the chosen service. */ continueUrl: string | null }[];
  watchChoices: { id: "netflix" | "animeunity"; name: string; tint: string; url: string }[];
  friends: { user: PublicUser; status: WatchStatus | "wishlist"; rating: RatingValue | null }[];
  allFriends: PublicUser[];
  offersUrl: string | null;
  related: Title[];
  /** The season this series is waiting on, when it has not come out yet. */
  awaited: AwaitedRelease | null;
  /** The "Serata insieme" the viewer follows this title with. */
  together: SharedWatchView | null;
}

export async function getTitleView(id: string): Promise<TitleView | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const title = await ensureTitle(id);
  if (!title) return null;
  const [library, wishlist, friends, related, groups] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    sectionOf(title) === "anime" ? getCatalog().related(title, 12).catch(() => []) : Promise.resolve([]),
    title.type === "movie" ? Promise.resolve([]) : listSharedWatchViews(repo, viewer.id, new Map([[title.id, title]])),
  ]);
  if (related.length) await cacheTitles(repo, related);
  const awaited = title.type === "movie" ? null : ((await awaitedReleases([title], italianDay())).get(title.id) ?? null);
  const tmdb = /^tmdb-(movie|tv)-(\d+)$/.exec(title.id);

  const friendRows: TitleView["friends"] = [];
  for (const f of friends) {
    const e = f.library.find((x) => x.titleId === id);
    if (e) friendRows.push({ user: f.user, status: e.status, rating: e.rating });
    else if (f.wishlist.some((w) => w.titleId === id)) friendRows.push({ user: f.user, status: "wishlist", rating: null });
  }

  // Anime pages always offer an Anime Unity shortcut. If playback has already
  // been observed, the progress entry instead opens the exact saved page.
  const hasStreamingCommunityProgress = sectionOf(title) !== "anime" && library.some((e) => e.titleId === id && e.progress?.providerId === "streamingcommunity");
  // A service the viewer chose by hand counts even when the catalogue does not list it.
  const chosen = library.find((e) => e.titleId === id)?.progress?.providerId;
  const providerIds = [...new Set([...title.providers, ...(chosen && chosen !== "animeunity" && chosen !== "streamingcommunity" && getProvider(chosen) ? [chosen] : []), ...(title.type === "anime" ? ["animeunity" as const] : []), ...(hasStreamingCommunityProgress ? ["streamingcommunity" as const] : [])])];
  return {
    title,
    awaited,
    entry: library.find((e) => e.titleId === id) ?? null,
    wishlisted: wishlist.some((w) => w.titleId === id),
    watchChoices: sectionOf(title) === "anime" ? (["netflix", "animeunity"] as const).map((pid) => {
      const p = getProvider(pid)!;
      return { id: pid, name: p.name, tint: p.tint, url: providerSearchUrl(pid, title.title)! };
    }) : [],
    providers: providerIds.map((pid) => {
      const p = getProvider(pid)!;
      const progress = library.find((e) => e.titleId === id)?.progress ?? null;
      // The same resolution Home uses for its button, for the service the viewer chose.
      const continueUrl =
        pid !== "animeunity" && pid !== "streamingcommunity" && progress?.providerId === pid
          ? resolveContinueUrl({ providerId: pid, externalId: null, title: title.title, type: title.type, season: progress.season, episode: progress.episode, titleId: id }, progress.url)
          : null;
      return {
        continueUrl,
        id: p.id,
        name: p.name,
        tint: p.tint,
        url: pid === "animeunity"
          ? progress?.providerId === "animeunity" && progress.url
            ? animeUnityResumeUrl(progress.url, 0)
            : providerSearchUrl(pid, title.title)
          : pid === "netflix"
            ? providerSearchUrl(pid, title.title)
            : getAdapter(pid).getContentUrl({ providerId: pid, externalId: null, title: title.title, type: title.type, season: null, episode: null, titleId: id }),
      };
    }),
    friends: friendRows,
    allFriends: friends.map((f) => f.user),
    offersUrl: tmdb ? `https://www.themoviedb.org/${tmdb[1]}/${tmdb[2]}/watch?locale=IT` : null,
    related,
    together: groups.find((g) => g.title.id === title.id) ?? null,
  };
}
