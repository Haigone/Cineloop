import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { searchKey } from "@/lib/text";
import { getRepository } from "@/server/data";
import { cacheTitles } from "./explore";

export interface ListItem {
  /** Netflix's id from the card's link; absent for titles from the data export. */
  id?: string;
  title: string;
}

/** "s:jujutsu kaisen" / "m:parasite": the same show under another catalogue id (seed, TMDB, ANN) has the same key. */
export function nameKey(title: Pick<Title, "title" | "type">): string {
  return `${title.type === "movie" ? "m" : "s"}:${searchKey(title.title)}`;
}

/** The names of titles the user already has, so an import never adds the same show twice under another id. */
export async function ownedNames(ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  return new Set((await getRepository().getTitlesByIds([...new Set(ids)])).map(nameKey));
}

export interface ImportResult {
  added: string[];
  /** Already in the wishlist or the library. */
  already: number;
  notFound: string[];
}

/**
 * "La mia lista", read from the Netflix page the user has open or from
 * Netflix's data export the user uploaded: each title
 * goes to the wishlist, unless it is already there or in the library.
 * Matched by a known Netflix id first, then by name (preferring what is on Netflix).
 */
export async function importNetflixList(userId: string, items: readonly ListItem[]): Promise<ImportResult> {
  const repo = getRepository();
  const [library, wishlist] = await Promise.all([repo.listLibrary(userId), repo.listWishlist(userId)]);
  const have = new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)]);
  const names = await ownedNames([...have]);
  const result: ImportResult = { added: [], already: 0, notFound: [] };

  const found: (Title | null)[] = [];
  // A few at a time: each name can take several catalogue lookups.
  for (let i = 0; i < items.length; i += 4) {
    found.push(...(await Promise.all(items.slice(i, i + 4).map((item) => match(item)))));
  }
  const titles = found.filter((t): t is Title => t !== null);
  await cacheTitles(repo, titles);

  for (const [i, title] of found.entries()) {
    if (!title) {
      result.notFound.push(items[i]!.title);
    } else if (have.has(title.id) || names.has(nameKey(title))) {
      result.already += 1;
    } else {
      await repo.addToWishlist(userId, title.id);
      have.add(title.id);
      names.add(nameKey(title));
      result.added.push(title.title);
    }
  }
  return result;
}

async function match(item: ListItem): Promise<Title | null> {
  const repo = getRepository();
  const linked = item.id ? await repo.findProviderLink("netflix", [item.id]) : null;
  if (linked) {
    const [title] = await repo.getTitlesByIds([linked]);
    if (title) return title;
  }
  const key = searchKey(item.title);
  const local = (await repo.searchTitles(item.title, 8)).find((t) => searchKey(t.title) === key);
  if (local) return local;
  return getCatalog()
    .findByName(item.title, { series: false, provider: "netflix" })
    .catch(() => null);
}
