import "server-only";
import { after } from "next/server";
import { getCatalog } from "@/integrations/catalog";
import type { CatalogSort } from "@/integrations/catalog/types";
import type { Genre, MediaType, ProviderId, Release, Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import { countdownLabel, formatDay, italianDay } from "@/lib/dates";
import { searchKey } from "@/lib/text";
import { loadFriendBundles } from "./shared";

export const PAGE_SIZE = 20;

export interface ExploreFilters {
  q: string;
  type: MediaType | "all";
  genre: Genre | null;
  /** Only what is included with this service in Italy. */
  provider: ProviderId | null;
  sort: CatalogSort;
  page: number;
}

export interface ExploreView {
  filters: ExploreFilters;
  titles: Title[];
  hasMore: boolean;
  /** Ids the viewer already has, so cards show the right state. */
  wishlistIds: string[];
  libraryIds: string[];
  /** False for the bundled demo catalog: the UI says results are a sample. */
  completeCatalog: boolean;
}

/**
 * Titles the viewer can browse, from the catalog rather than from their own
 * lists. Everything shown is cached locally first, so it can be added to a
 * list straight away.
 */
export async function getExploreView(filters: ExploreFilters): Promise<ExploreView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const catalog = getCatalog();

  const searching = filters.q.trim().length >= 2;
  let found: Title[];
  let hasMore: boolean;
  if (searching) {
    // Search has no server-side paging here: ask for everything up to this page and slice.
    const all = await catalog.search(filters.q.trim(), PAGE_SIZE * filters.page + 1);
    const matching = filters.provider ? all.filter((t) => t.providers.includes(filters.provider!)) : all;
    found = matching.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
    hasMore = matching.length > filters.page * PAGE_SIZE;
  } else {
    // "Tutto" asks for a page of films and one of series together.
    const page = await catalog.discover(
      { type: filters.type, genre: filters.genre, provider: filters.provider, sort: filters.sort, page: filters.page },
      filters.type === "all" ? PAGE_SIZE * 2 : PAGE_SIZE,
    );
    found = page.titles;
    hasMore = page.hasMore;
  }

  const titles = await canonical(repo, found);
  await cacheTitles(repo, titles);

  const [wishlist, library] = await Promise.all([repo.listWishlist(viewer.id), repo.listLibrary(viewer.id)]);
  return {
    filters,
    titles,
    hasMore,
    wishlistIds: wishlist.map((w) => w.titleId),
    libraryIds: library.map((e) => e.titleId),
    completeCatalog: catalog.complete,
  };
}

export interface Shelf {
  id: string;
  title: string;
  description?: string;
  titles: Title[];
}

/** A release ready for a poster: the countdown badge and the line under the title. */
export interface ReleaseCard {
  title: Title;
  date: string | null;
  /** "Tra 12 giorni", "Domani", "Oggi"; "Annunciata" without a date. */
  badge: string;
  /** "Stagione 5 · 14 novembre". */
  meta: string;
}

export interface ForYouView {
  /** The week's most watched titles, in order. */
  top: Title[];
  /** New seasons of series the viewer has watched, soonest first. */
  comingBack: ReleaseCard[];
  /** Films and series coming out soon on the streaming services, for the chosen type. */
  upcoming: ReleaseCard[];
  /** Anime of the coming seasons from MyAnimeList's calendar, on a platform we don't know yet. */
  seasonal: ReleaseCard[];
  /** Films that will only be in cinemas: shown last, they are not what CineLoop is for. */
  atCinema: ReleaseCard[];
  /** False when release dates are examples (demo catalog). */
  realDates: boolean;
  /** True when `top` really is this week's chart (TMDB), not the demo catalog's best rated. */
  topIsWeekly: boolean;
  shelves: Shelf[];
  /** Popular titles to tap "Mi è piaciuto" on, while the viewer has rated too few to go on. */
  picker: Title[];
  /** How many titles the viewer has liked so far (the picker asks for a few). */
  liked: number;
  wishlistIds: string[];
  libraryIds: string[];
  completeCatalog: boolean;
}

/** Below this many liked titles, Esplora asks the viewer to pick a few. */
export const TASTE_TARGET = 3;

/**
 * The opening of Esplora: this week's chart, then what to watch next built
 * from the viewer's own taste, then from friends. A new account gets a quick
 * "what did you like?" picker so "Per te" has something to start from.
 */
export async function getForYouView(type: MediaType | "all" = "all"): Promise<ForYouView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const catalog = getCatalog();

  const [library, wishlist, friends] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
  ]);
  const knownTitles = await repo.getTitlesByIds([...new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)])]);
  const isKnown = knownMatcher(knownTitles);
  const ofType = (t: Title) => type === "all" || t.type === type;

  // Seeds for "Per te": what the viewer watched recently, what is at the top
  // of their wishlist, and their favourites. Recommendations are things to
  // add to the wishlist next.
  const liked = library
    .filter((e) => (e.rating ?? 0) >= 7 || (e.status === "completed" && e.rating === null))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""));
  const recent = library
    .filter((e) => e.lastWatchedAt && (e.status === "watching" || e.status === "completed") && (e.rating === null || e.rating >= 5))
    .sort((a, b) => Date.parse(b.lastWatchedAt!) - Date.parse(a.lastWatchedAt!));
  const seedIds = [
    ...new Set([
      ...recent.slice(0, 3).map((e) => e.titleId),
      ...wishlist.slice(0, 3).map((w) => w.titleId),
      ...liked.slice(0, 2).map((e) => e.titleId),
    ]),
  ].slice(0, 6);
  const fromWishlist = liked.length === 0 && recent.length === 0;
  const seedTitles = await repo.getTitlesByIds(seedIds);
  const favourite = (await repo.getTitlesByIds(liked.slice(0, 1).map((e) => e.titleId)))[0];

  // Series the viewer watched (or is watching): are they coming back?
  const followed = await repo.getTitlesByIds(
    library
      .filter((e) => e.status === "watching" || e.status === "completed")
      .sort((a, b) => Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
      .map((e) => e.titleId),
  );
  const today = italianDay();

  const [forYou, trending, becauseOf, popular, returning, coming] = await Promise.all([
    seedTitles.length ? catalog.similarTo(seedTitles, 60) : Promise.resolve([]),
    catalog.trending(60),
    favourite ? catalog.similarTo([favourite], 30) : Promise.resolve([]),
    liked.length < TASTE_TARGET ? catalog.discover({ type, genre: null, sort: "popular" }, 40).then((p) => p.titles) : Promise.resolve([]),
    catalog.nextSeasons(followed.filter((t) => t.type !== "movie" && ofType(t)).slice(0, 20), today).catch(() => []),
    catalog.upcoming(type, today, 20).catch(() => []),
  ]);

  // What friends rated highly or put on their own wishlist.
  const friendScores = new Map<string, number>();
  for (const f of friends) {
    for (const e of f.library) if ((e.rating ?? 0) >= 8) friendScores.set(e.titleId, (friendScores.get(e.titleId) ?? 0) + 2);
    for (const w of f.wishlist) friendScores.set(w.titleId, (friendScores.get(w.titleId) ?? 0) + 1);
  }
  const friendTitles = await repo.getTitlesByIds([...friendScores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id));

  const fresh = (list: Title[], n: number) => list.filter((t) => ofType(t) && !isKnown(t)).slice(0, n);
  const [top, forYouRow, becauseRow, friendsRow, picker] = await Promise.all([
    canonical(repo, trending.filter(ofType).slice(0, 10)),
    canonical(repo, fresh(forYou, 20)),
    canonical(repo, fresh(becauseOf, 20)),
    Promise.resolve(fresh(friendTitles, 20)),
    canonical(repo, fresh(popular, 12)),
  ]);

  const shelves: Shelf[] = [];
  if (forYouRow.length) {
    shelves.push({
      id: "for-you",
      title: "Per te",
      description: fromWishlist
        ? "Simili a quello che hai in wishlist: aggiungi quelli che ti ispirano."
        : "Da quello che hai visto di recente e dalla tua wishlist: aggiungi quelli che ti ispirano.",
      titles: forYouRow,
    });
  }
  if (becauseRow.length && favourite) shelves.push({ id: "because", title: `Perché ti è piaciuto ${favourite.title}`, titles: becauseRow });
  if (friendsRow.length) {
    shelves.push({ id: "friends", title: "Piace ai tuoi amici", description: "Votati alto o in wishlist dai tuoi amici.", titles: friendsRow });
  }

  const comingBack = sortReleases(returning).map((r) => releaseCard(r, today));
  const comingUp = sortReleases(
    (await canonicalReleases(repo, coming)).filter((r) => !isKnown(r.title) || wishlist.some((w) => w.titleId === r.title.id)),
  );
  const upcomingRow = comingUp.filter((r) => r.venue !== "cinema" && r.venue !== "seasonal").map((r) => releaseCard(r, today));
  const seasonalRow = comingUp.filter((r) => r.venue === "seasonal").map((r) => releaseCard(r, today));
  const cinemaRow = comingUp.filter((r) => r.venue === "cinema").map((r) => releaseCard(r, today));

  await cacheTitles(repo, [...top, ...shelves.flatMap((x) => x.titles), ...picker, ...upcomingRow.map((r) => r.title), ...seasonalRow.map((r) => r.title), ...cinemaRow.map((r) => r.title)]);
  // On the day something the viewer follows comes out, leave a notification.
  const wished = new Set(wishlist.map((w) => w.titleId));
  const outToday = [...returning, ...coming.filter((r) => wished.has(r.title.id))].filter((r) => r.date === today);
  if (outToday.length && catalog.complete) after(() => notifyReleases(repo, viewer.id, outToday));

  return {
    top,
    comingBack,
    upcoming: upcomingRow,
    seasonal: seasonalRow,
    atCinema: cinemaRow,
    realDates: catalog.complete,
    topIsWeekly: catalog.complete,
    shelves,
    picker: liked.length < TASTE_TARGET ? picker : [],
    liked: liked.length,
    wishlistIds: wishlist.map((w) => w.titleId),
    libraryIds: library.map((e) => e.titleId),
    completeCatalog: catalog.complete,
  };
}

/** Dated releases first, soonest first; announced-without-date last. */
function sortReleases(list: Release[]): Release[] {
  return [...list].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export function releaseCard(r: Release, today: string): ReleaseCard {
  const when = r.date ? formatDay(r.date, today) : "senza data";
  return {
    title: r.title,
    date: r.date,
    badge: r.date ? countdownLabel(r.date, today) : "Annunciata",
    meta: r.season ? `Stagione ${r.season} · ${when}` : r.date ? `Dal ${when}` : when,
  };
}

async function canonicalReleases(repo: Repository, list: Release[]): Promise<Release[]> {
  const titles = await canonical(repo, list.map((r) => r.title));
  const byKey = new Map(titles.map((t) => [identity(t), t]));
  return list.map((r) => ({ ...r, title: byKey.get(identity(r.title)) ?? r.title }));
}

async function notifyReleases(repo: Repository, userId: string, releases: Release[]) {
  const existing = new Set((await repo.listNotifications(userId)).map((n) => n.message));
  for (const r of releases) {
    const message = r.season ? `Esce oggi la stagione ${r.season} di ${r.title.title}.` : `Esce oggi ${r.title.title}.`;
    if (existing.has(message)) continue;
    await repo.createNotification({ userId, kind: "system", message, href: `/title/${r.title.id}`, at: new Date().toISOString() });
  }
}

const identity = (t: Pick<Title, "title" | "year">) => `${searchKey(t.title)}|${t.year}`;

/** Recognises a title the viewer already has, even under another source's id. */
function knownMatcher(known: readonly Title[]) {
  const ids = new Set(known.map((t) => t.id));
  const keys = new Set(known.map(identity));
  return (t: Title) => ids.has(t.id) || keys.has(identity(t));
}

/**
 * Swaps remote results for the local copy of the same title, when there is
 * one (the bundled titles exist under their own ids), so lists, ratings and
 * friends' activity all point at one record.
 */
export async function canonical(repo: Repository, titles: Title[]): Promise<Title[]> {
  if (titles.length === 0) return titles;
  const local = new Map(SEED_TITLES.map((t) => [identity(t), t.id]));
  const swaps = titles.map((t) => (t.id.startsWith("tmdb-") ? local.get(identity(t)) : undefined));
  if (!swaps.some(Boolean)) return titles;
  const found = new Map((await repo.getTitlesByIds(swaps.filter((x): x is string => Boolean(x)))).map((t) => [t.id, t]));
  const out: Title[] = [];
  const seen = new Set<string>();
  titles.forEach((t, i) => {
    const pick = (swaps[i] && found.get(swaps[i]!)) || t;
    if (!seen.has(pick.id)) out.push(pick);
    seen.add(pick.id);
  });
  return out;
}

/**
 * Stores catalog results locally. Lists reference titles by id, so a title
 * must exist here before it can be added to one.
 */
function withKnownSeasons(fresh: Title, known: Title | undefined): Title {
  // A list result does not say which series a film belongs to: keep what is known.
  if (fresh.type === "movie") return fresh.partOf === undefined && known?.type === "movie" && known.partOf ? { ...fresh, partOf: known.partOf } : fresh;
  if (fresh.seasons.length > 0 || !known || known.type === "movie" || known.seasons.length === 0) return fresh;
  return { ...fresh, seasons: known.seasons, episodeRuntimeMinutes: fresh.episodeRuntimeMinutes || known.episodeRuntimeMinutes };
}

export async function cacheTitles(repo: Repository, titles: readonly Title[]): Promise<void> {
  if (titles.length === 0) return;
  try {
    // Search and list results carry no seasons: keep the ones already known.
    const known = new Map((await repo.getTitlesByIds(titles.map((t) => t.id))).map((t) => [t.id, t]));
    await repo.upsertTitles(titles.map((t) => withKnownSeasons(t, known.get(t.id))));
  } catch (err) {
    console.error("caching catalog titles failed", err);
  }
}

/** Fetches a title from the catalog and caches it, when it is not local yet. */
export async function ensureTitle(id: string): Promise<Title | null> {
  const repo = getRepository();
  const [local] = await repo.getTitlesByIds([id]);
  if (local && !needsDetails(local)) return local;
  const remote = await getCatalog().getTitle(id);
  if (!remote) return local ?? null;
  if (!local || JSON.stringify(withKnownSeasons(remote, local)) !== JSON.stringify(local)) await cacheTitles(repo, [remote]);
  return withKnownSeasons(remote, local);
}

/**
 * A title cached from a list lacks what only its details say: a series' seasons,
 * whether a film comes from an anime series, where it streams. Catalogue
 * answers are cached for a day, so asking again costs little.
 */
function needsDetails(t: Title): boolean {
  if (!/^tmdb-/.test(t.id)) return false;
  if (t.providers.length === 0) return true;
  return t.type === "movie" ? t.partOf === undefined : t.seasons.length === 0;
}

