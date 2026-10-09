import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { searchKey } from "@/lib/text";
import { getRepository } from "@/server/data";
import { cacheTitles } from "./explore";

export interface ListItem {
  /** Netflix's id from the card's link. */
  id: string;
  title: string;
}

export interface ImportResult {
  added: string[];
  /** Already in the wishlist or the library. */
  already: number;
  notFound: string[];
}

/**
 * "La mia lista" read from the Netflix page the user has open: each title
 * goes to the wishlist, unless it is already there or in the library.
 * Matched by a known Netflix id first, then by name (preferring what is on Netflix).
 */
export async function importNetflixList(userId: string, items: readonly ListItem[]): Promise<ImportResult> {
  const repo = getRepository();
  const [library, wishlist] = await Promise.all([repo.listLibrary(userId), repo.listWishlist(userId)]);
  const have = new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)]);
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
    } else if (have.has(title.id)) {
      result.already += 1;
    } else {
      await repo.addToWishlist(userId, title.id);
      have.add(title.id);
      result.added.push(title.title);
    }
  }
  return result;
}

async function match(item: ListItem): Promise<Title | null> {
  const repo = getRepository();
  const linked = await repo.findProviderLink("netflix", [item.id]);
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
