/**
 * Netflix's official weekly Top 10, from the data file Netflix publishes for
 * download on its Tudum Top 10 site (top10.netflix.com). This is public data
 * Netflix offers to everyone: no account, no scraping of the service, no
 * private endpoints. See docs/providers.md.
 */

export const NETFLIX_TOP10_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv";

export interface NetflixTop10Row {
  rank: number;
  category: "film" | "tv";
  /** Show or film name as Netflix lists it (localised where Netflix provides it). */
  name: string;
  /** "Stranger Things: Stagione 4" for TV, when present. */
  season: string | null;
}

export interface NetflixTop10 {
  country: string;
  /** Week end date, YYYY-MM-DD. */
  week: string;
  rows: NetflixTop10Row[];
}

const REQUIRED = ["country_iso2", "week", "category", "weekly_rank", "show_title"] as const;

/**
 * Picks one country's latest week out of the TSV, line by line, so the whole
 * multi-year file never has to sit in memory. Returns null if the format is
 * not the one expected (better no chart than a wrong one).
 */
export function parseTop10(lines: Iterable<string>, country: string): NetflixTop10 | null {
  let cols: Map<string, number> | null = null;
  let week = "";
  let rows: NetflixTop10Row[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    if (!cols) {
      cols = new Map(cells.map((c, i) => [c.trim(), i]));
      if (!REQUIRED.every((c) => cols!.has(c))) return null;
      continue;
    }
    const get = (c: string) => cells[cols!.get(c) ?? -1]?.trim() ?? "";
    if (get("country_iso2").toUpperCase() !== country) continue;
    const w = get("week");
    if (w < week) continue;
    if (w > week) {
      week = w;
      rows = [];
    }
    const rank = Number(get("weekly_rank"));
    const name = get("show_title");
    if (!name || !Number.isInteger(rank)) continue;
    rows.push({
      rank,
      category: /film/i.test(get("category")) ? "film" : "tv",
      name,
      season: cols.has("season_title") && get("season_title") && get("season_title") !== "N/A" ? get("season_title") : null,
    });
  }
  if (!week || rows.length === 0) return null;
  rows.sort((a, b) => (a.category === b.category ? a.rank - b.rank : a.category === "film" ? -1 : 1));
  return { country, week, rows };
}

/** Downloads and parses the file. Throws on network or format problems. */
export async function fetchNetflixTop10(country = "IT", fetcher: typeof fetch = fetch): Promise<NetflixTop10> {
  const res = await fetcher(NETFLIX_TOP10_URL, { cache: "no-store", headers: { Accept: "text/tab-separated-values,text/plain" } });
  if (!res.ok || !res.body) throw new Error(`Netflix Top 10 download failed: ${res.status}`);
  const result = parseTop10(await collectLines(res.body, country), country);
  if (!result) throw new Error("Netflix Top 10: unexpected file format");
  return result;
}

async function collectLines(body: ReadableStream<Uint8Array>, country: string): Promise<string[]> {
  // Keeps the header plus only lines mentioning the country code, to stay small.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const keep: string[] = [];
  let buffer = "";
  let first = true;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (first || line.includes(`\t${country}\t`)) keep.push(line.replace(/\r$/, ""));
      first = false;
    }
    if (done) break;
  }
  return keep;
}
