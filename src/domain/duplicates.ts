import { searchKey } from "@/lib/text";

/**
 * Catalogue entries that repeat another title, by the id of the one kept. They never show again
 * (search, Esplora, suggestions), and whatever someone saved on them moves to the kept title.
 */
export const REPLACED_TITLES: Readonly<Record<string, string>> = {
  // JoJo: TMDB's split-off series and the anime-sources franchise repeat TMDB's own JoJo with every part.
  "tmdb-tv-60862": "tmdb-tv-45790",
  "anime-ann-14445": "tmdb-tv-45790",
};

/** Searches a kept title answers first, by its id ("jojo" opens JoJo, not Jojo Rabbit). */
export const FIRST_FOR: Readonly<Record<string, readonly string[]>> = {
  "tmdb-tv-45790": ["jojo"],
};

export const isReplaced = (id: string): boolean => Object.hasOwn(REPLACED_TITLES, id);

/** The title kept in place of a duplicate, or null when the id is not a duplicate. */
export const replacementOf = (id: string): string | null => (isReplaced(id) ? REPLACED_TITLES[id]! : null);

/** True for a title kept in place of duplicates: it stays as it is, never folded into another card. */
export const isKeptTitle = (id: string): boolean => Object.values(REPLACED_TITLES).includes(id);

export const withoutReplaced = <T extends { id: string }>(titles: readonly T[]): T[] => titles.filter((t) => !isReplaced(t.id));

/** The kept titles a search should open with: the query is one of their names, or the start of one. */
export function firstFor(query: string): string[] {
  const key = searchKey(query).replace(/\s+/g, " ");
  if (key.length < 3) return [];
  return Object.entries(FIRST_FOR)
    .filter(([, names]) => names.some((n) => n === key || n.startsWith(key)))
    .map(([id]) => id);
}

/** Results with the titles this query should open with moved to the top. */
export function withFirst<T extends { id: string }>(query: string, titles: readonly T[]): T[] {
  const first = firstFor(query);
  if (first.length === 0) return [...titles];
  const top = first.flatMap((id) => titles.filter((t) => t.id === id));
  return [...top, ...titles.filter((t) => !top.includes(t))];
}
