import { searchKey } from "@/lib/text";

// "Bleach: Thousand-Year Blood War", "Demon Slayer - Il treno Mugen", "JoJo – Stone Ocean".
const PART = /\s*[:：]\s+|\s+[-–—]\s+/;
const COLLECTION = /\s*[-–—]?\s*\b(collezione|collection|la saga|saga|serie di film|film collection)\s*$/i;

/** Search results: a film from an anime series found with that series is one result, not two. */
export function withoutSeriesFilms<T extends { id: string; type: string; partOf?: string | null }>(titles: readonly T[]): T[] {
  const found = new Set(titles.map((t) => t.id));
  return titles.filter((t) => !(t.type === "movie" && t.partOf && found.has(t.partOf)));
}

/** A title's name before any subtitle: "Bleach: Thousand-Year Blood War" → "Bleach". */
export function franchiseHead(name: string): string {
  return name.split(PART)[0]!.trim();
}

/** The franchise a title belongs to, as a search key. */
export function franchiseKey(name: string): string {
  return searchKey(franchiseHead(name));
}

/** The names a film could share with its series: its own, before a subtitle, and its collection's. */
export function franchiseNames(names: readonly (string | null | undefined)[], collection?: string | null): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (!n?.trim()) continue;
    const head = n.split(PART)[0]!.trim();
    if (head.length >= 2) out.add(head);
  }
  const series = collection?.replace(COLLECTION, "").trim();
  if (series && series.length >= 2) out.add(series);
  return [...out];
}
