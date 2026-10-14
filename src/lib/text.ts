/** Typographic quotes and apostrophes (’ ‘ ʼ ` ´) as the plain ASCII ones. */
export function plainQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u201B\u02BC\u0060\u00B4]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/** Lower-case and strip accents so "shogun" finds "Shōgun" and "l’8" finds "l'8". */
export function searchKey(s: string): string {
  return plainQuotes(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * True when the query names this person ("dicaprio", "leonardo dicaprio"),
 * not just a few letters that happen to be in their name.
 */
export function namesPerson(query: string, name: string): boolean {
  const key = (s: string) => searchKey(s).replace(/\s+/g, " ");
  const q = key(query);
  const full = key(name);
  if (q.length < 3) return false;
  return full === q || full.split(" ").includes(q) || (q.includes(" ") && full.startsWith(q));
}
