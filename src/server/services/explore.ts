import "server-only";
import { getCatalog } from "@/integrations/catalog";
import type { CatalogSort } from "@/integrations/catalog/types";
import type { Genre, MediaType, Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import { searchKey } from "@/lib/text";
import { loadFriendBundles } from "./shared";

export const PAGE_SIZE = 24;

export interface ExploreFilters {
  q: string;
  type: MediaType | "all";
  genre: Genre | null;
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

  const found = filters.q.trim().length >= 2
    ? await catalog.search(filters.q.trim(), PAGE_SIZE * filters.page)
    : await catalog.discover({ type: filters.type, genre: filters.genre, sort: filters.sort, page: filters.page }, PAGE_SIZE);

  // Search has no server-side paging here: ask for everything up to this page and slice.
  const titles = await canonical(repo, filters.q.trim().length >= 2 ? found.slice((filters.page - 1) * PAGE_SIZE) : found);
  await cacheTitles(repo, titles);

  const [wishlist, library] = await Promise.all([repo.listWishlist(viewer.id), repo.listLibrary(viewer.id)]);
  return {
    filters,
    titles,
    hasMore: titles.length >= PAGE_SIZE,
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

export interface ForYouView {
  /** The week's most watched titles, in order. */
  top: Title[];
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

  const [forYou, trending, becauseOf, popular] = await Promise.all([
    seedTitles.length ? catalog.similarTo(seedTitles, 60) : Promise.resolve([]),
    catalog.trending(60),
    favourite ? catalog.similarTo([favourite], 30) : Promise.resolve([]),
    liked.length < TASTE_TARGET ? catalog.discover({ type, genre: null, sort: "popular" }, 40) : Promise.resolve([]),
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

  await cacheTitles(repo, [...top, ...shelves.flatMap((x) => x.titles), ...picker]);

  return {
    top,
    topIsWeekly: catalog.complete,
    shelves,
    picker: liked.length < TASTE_TARGET ? picker : [],
    liked: liked.length,
    wishlistIds: wishlist.map((w) => w.titleId),
    libraryIds: library.map((e) => e.titleId),
    completeCatalog: catalog.complete,
  };
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
export async function cacheTitles(repo: Repository, titles: readonly Title[]): Promise<void> {
  if (titles.length === 0) return;
  try {
    await repo.upsertTitles(titles);
  } catch (err) {
    console.error("caching catalog titles failed", err);
  }
}

/** Fetches a title from the catalog and caches it, when it is not local yet. */
export async function ensureTitle(id: string): Promise<Title | null> {
  const repo = getRepository();
  const [local] = await repo.getTitlesByIds([id]);
  if (local) return local;
  const remote = await getCatalog().getTitle(id);
  if (remote) await cacheTitles(repo, [remote]);
  return remote;
}

