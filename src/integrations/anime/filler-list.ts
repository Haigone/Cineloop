type Fetch = typeof fetch;

const BASE = "https://www.animefillerlist.com/shows";
const DAY = 86_400;

/** "Bleach: Thousand-Year Blood War" → "bleach-thousand-year-blood-war", the way Anime Filler List names its pages. */
export function fillerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The episode numbers a show page lists as pure filler ("Mixed Canon/Filler" episodes are kept). */
export function parseFillerEpisodes(html: string): number[] {
  const out: number[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = row[1]!;
    const number = /<td[^>]*class="[^"]*\bNumber\b[^"]*"[^>]*>\s*(\d+)\s*<\/td>/i.exec(body)?.[1];
    const type = /<td[^>]*class="[^"]*\bType\b[^"]*"[^>]*>\s*([^<]*?)\s*<\/td>/i.exec(body)?.[1];
    if (number && type && type.toLowerCase() === "filler") out.push(Number(number));
  }
  return out;
}

/**
 * Anime Filler List has no API, so its public show page is read: one page per
 * show, cached for a month, identified by a User-Agent. A missing page is no filler data.
 */
export class FillerList {
  constructor(
    private fetcher: Fetch = fetch,
    private userAgent = "CineLoop/1.0 (personal watch tracker)",
  ) {}

  async fillerOf(showName: string): Promise<number[]> {
    const slug = fillerSlug(showName);
    if (!slug) return [];
    try {
      const res = await this.fetcher(`${BASE}/${slug}`, {
        headers: { Accept: "text/html", "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 30 * DAY },
      } as RequestInit);
      return res.ok ? parseFillerEpisodes(await res.text()) : [];
    } catch (err) {
      console.error("Anime Filler List request failed", err);
      return [];
    }
  }
}
