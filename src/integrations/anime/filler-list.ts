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

const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * The episode numbers a show page lists as pure filler ("Mixed Canon/Filler" episodes are kept).
 * A row counts when its class list has a "filler" class of its own or its Type cell says "Filler".
 */
export function parseFillerEpisodes(html: string): number[] {
  const out: number[] = [];
  for (const row of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const classes = (/class\s*=\s*["']([^"']*)["']/i.exec(row[1]!)?.[1] ?? "").toLowerCase().split(/\s+/);
    const cell = (name: string) => new RegExp(`<td[^>]*class\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]*?)</td>`, "i").exec(row[2]!)?.[1];
    const number = /^\d+$/.exec(text(cell("Number") ?? ""))?.[0];
    if (!number) continue;
    const type = text(cell("Type") ?? "").toLowerCase();
    if (classes.includes("filler") || type === "filler") out.push(Number(number));
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
