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

export type EpisodeKind = "mangaCanon" | "animeCanon" | "mixed" | "filler";

const KIND_BY_TEXT: Record<string, EpisodeKind> = {
  "manga canon": "mangaCanon",
  "anime canon": "animeCanon",
  "mixed canon/filler": "mixed",
  filler: "filler",
};

/** Every listed episode with the kind the page gives it, by number. */
export function parseEpisodeKinds(html: string): Map<number, EpisodeKind> {
  const out = new Map<number, EpisodeKind>();
  for (const row of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const classes = (/class\s*=\s*["']([^"']*)["']/i.exec(row[1]!)?.[1] ?? "").toLowerCase().split(/\s+/);
    const cell = (name: string) => new RegExp(`<td[^>]*class\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]*?)</td>`, "i").exec(row[2]!)?.[1];
    const number = /^\d+$/.exec(text(cell("Number") ?? ""))?.[0];
    if (!number) continue;
    const type = text(cell("Type") ?? "").toLowerCase();
    const kind = KIND_BY_TEXT[type] ?? (classes.includes("filler") ? "filler" : classes.includes("anime_canon") ? "animeCanon" : classes.includes("manga_canon") ? "mangaCanon" : undefined);
    if (kind) out.set(Number(number), kind);
  }
  return out;
}

/**
 * The episode numbers a show page lists as pure filler ("Mixed Canon/Filler" episodes are kept).
 * A row counts when its class list has a "filler" class of its own or its Type cell says "Filler".
 */
export function parseFillerEpisodes(html: string): number[] {
  return [...parseEpisodeKinds(html)].filter(([, k]) => k === "filler").map(([n]) => n);
}

/** [first, last] runs of consecutive numbers, as the site's quick list writes them ("1-4, 6"). */
export function toRanges(numbers: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of [...numbers].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else if (!last || n > last[1]) out.push([n, n]);
  }
  return out;
}

/** The quick list: episodes of each kind as ranges. */
export type QuickList = Record<EpisodeKind, [number, number][]>;

export function quickListOf(kinds: Map<number, EpisodeKind>, max = Infinity): QuickList {
  const by = (k: EpisodeKind) => toRanges([...kinds].filter(([n, kind]) => kind === k && n <= max).map(([n]) => n));
  return { mangaCanon: by("mangaCanon"), animeCanon: by("animeCanon"), mixed: by("mixed"), filler: by("filler") };
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
    return [...(await this.kindsOf(showName))].filter(([, k]) => k === "filler").map(([n]) => n);
  }

  /** The kind of every episode of the show (empty when the site has no page for it). */
  async kindsOf(showName: string): Promise<Map<number, EpisodeKind>> {
    const slug = fillerSlug(showName);
    if (!slug) return new Map();
    try {
      const res = await this.fetcher(`${BASE}/${slug}`, {
        headers: { Accept: "text/html", "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 30 * DAY },
      } as RequestInit);
      return res.ok ? parseEpisodeKinds(await res.text()) : new Map();
    } catch (err) {
      console.error("Anime Filler List request failed", err);
      return new Map();
    }
  }
}
