import "server-only";
import { getCatalog } from "@/integrations/catalog";
import type { CatalogSort } from "@/integrations/catalog/types";
import type { Genre, MediaType, Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
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
  const titles = filters.q.trim().length >= 2 ? found.slice((filters.page - 1) * PAGE_SIZE) : found;
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
  shelves: Shelf[];
  wishlistIds: string[];
  libraryIds: string[];
  completeCatalog: boolean;
  /** True when the viewer has rated or watched nothing yet. */
  cold: boolean;
}

/**
 * The opening of Esplora: what to watch next, built from the viewer's own
 * taste, then from friends, then from what is popular. A new account still
 * gets a full page — it just leans on the last of those.
 */
export async function getForYouView(): Promise<ForYouView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const catalog = getCatalog();

  const [library, wishlist, friends] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
  ]);
  const known = new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)]);

  // Seeds: the titles the viewer liked most, newest first, capped so one
  // request stays cheap.
  const seeds = library
    .filter((e) => (e.rating ?? 0) >= 7 || e.status === "completed")
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
    .slice(0, 4);
  const seedTitles = await repo.getTitlesByIds(seeds.map((e) => e.titleId));

  const [forYou, trending, becauseOf] = await Promise.all([
    seedTitles.length ? catalog.similarTo(seedTitles.map((t) => t.id), 40) : Promise.resolve([]),
    catalog.trending(40),
    seedTitles[0] ? catalog.similarTo([seedTitles[0].id], 20) : Promise.resolve([]),
  ]);

  // What friends rated highly or put on their own wishlist, as catalog rows.
  const friendIds = new Map<string, { loved: string[]; wanted: string[] }>();
  for (const f of friends) {
    for (const e of f.library) {
      if ((e.rating ?? 0) >= 8 && !known.has(e.titleId)) {
        const entry = friendIds.get(e.titleId) ?? { loved: [], wanted: [] };
        entry.loved.push(f.user.displayName);
        friendIds.set(e.titleId, entry);
      }
    }
    for (const w of f.wishlist) {
      if (known.has(w.titleId)) continue;
      const entry = friendIds.get(w.titleId) ?? { loved: [], wanted: [] };
      entry.wanted.push(f.user.displayName);
      friendIds.set(w.titleId, entry);
    }
  }
  const friendTitles = await repo.getTitlesByIds(
    [...friendIds.entries()].sort((a, b) => b[1].loved.length - a[1].loved.length).slice(0, 20).map(([id]) => id),
  );

  const unseen = (list: Title[]) => list.filter((t) => !known.has(t.id));
  const shelves: Shelf[] = [
    { id: "for-you", title: "Per te", description: "Dai titoli che hai votato più alto.", titles: unseen(forYou).slice(0, 20) },
    seedTitles[0]
      ? { id: "because", title: `Perché ti è piaciuto ${seedTitles[0].title}`, titles: unseen(becauseOf).slice(0, 20) }
      : { id: "because", title: "", titles: [] },
    { id: "friends", title: "Piace ai tuoi amici", description: "Titoli che i tuoi amici hanno votato alto o vogliono vedere.", titles: friendTitles },
    { id: "trending", title: "Di tendenza questa settimana", titles: unseen(trending).slice(0, 20) },
  ].filter((s) => s.title && s.titles.length > 0);

  await cacheTitles(repo, shelves.flatMap((s) => s.titles));

  return {
    shelves,
    wishlistIds: wishlist.map((w) => w.titleId),
    libraryIds: library.map((e) => e.titleId),
    completeCatalog: catalog.complete,
    cold: library.length === 0 && wishlist.length === 0,
  };
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

