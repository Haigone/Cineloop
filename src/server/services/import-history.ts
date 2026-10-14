import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { searchKey } from "@/lib/text";
import { getRepository } from "@/server/data";
import { cacheTitles } from "./explore";
import { nameKey, ownedNames } from "./import-list";

/**
 * One title from the user's Netflix viewing history, already grouped by the
 * extension: a series with the highest season seen, or a film. The CSV itself
 * never reaches the server.
 */
export interface HistoryItem {
  /** The series name, or the film's whole title. */
  title: string;
  /** "series": the history named a season. "unknown": "Name: something", series or film. */
  kind: "series" | "film" | "unknown";
  season?: number;
  /** The row as Netflix wrote it, for the error log. */
  sample: string;
}

export interface HistoryResult {
  added: string[];
  /** Already in the library: left as they are. */
  already: number;
  notFound: { title: string; sample: string }[];
}

/**
 * Adds what the user watched on Netflix and is not yet in the library: a film
 * as seen, a series as seen through the highest season in the history (a later
 * season then shows as "Novità"). Titles already in the library are left alone;
 * the ones now in the library leave the wishlist, as when the extension sees them played.
 */
export async function importNetflixHistory(userId: string, items: readonly HistoryItem[]): Promise<HistoryResult> {
  const repo = getRepository();
  const [library, wishlist] = await Promise.all([repo.listLibrary(userId), repo.listWishlist(userId)]);
  const have = new Set(library.map((e) => e.titleId));
  // The same show can sit in the library under another catalogue id (seed, TMDB, ANN): match by name too.
  const names = await ownedNames([...have]);
  const wished = new Set(wishlist.map((w) => w.titleId));
  const result: HistoryResult = { added: [], already: 0, notFound: [] };

  const found: (Title | null)[] = [];
  // A few at a time: each name can take several catalogue lookups.
  for (let i = 0; i < items.length; i += 4) {
    found.push(...(await Promise.all(items.slice(i, i + 4).map((item) => match(item).catch(() => null)))));
  }
  await cacheTitles(repo, found.filter((t): t is Title => t !== null));

  for (const [i, title] of found.entries()) {
    const item = items[i]!;
    if (!title) {
      result.notFound.push({ title: item.title, sample: item.sample });
    } else if (have.has(title.id) || names.has(nameKey(title))) {
      result.already += 1;
    } else {
      if (title.type === "movie") await repo.setLibraryStatus(userId, title.id, "completed");
      else await repo.markSeenThrough(userId, title.id, Math.max(1, item.season ?? 1));
      if (wished.has(title.id)) await repo.removeFromWishlist(userId, title.id);
      have.add(title.id);
      names.add(nameKey(title));
      result.added.push(title.title);
    }
  }
  return result;
}

async function byName(name: string, series: boolean): Promise<Title | null> {
  const key = searchKey(name);
  if (!key) return null;
  const local = (await getRepository().searchTitles(name, 8)).find((t) => searchKey(t.title) === key && (!series || t.type !== "movie"));
  if (local) return local;
  return getCatalog().findByName(name, { series, provider: "netflix" });
}

async function match(item: HistoryItem): Promise<Title | null> {
  if (item.kind === "series") return (await byName(item.title, true)) ?? byName(item.title, false);
  if (item.kind === "film") return byName(item.title, false);
  // "Name: something": a film with a subtitle, or a series episode without a season.
  const whole = await byName(item.sample, false);
  if (whole) return whole;
  return byName(item.title, true);
}
