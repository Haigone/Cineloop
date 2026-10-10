import { childrenNamed, parseXml, type XmlNode } from "@/lib/xml";
import type { AnimeEntry } from "./types";

type Fetch = typeof fetch;

const API = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml";
/** The Encyclopedia API asks for at most one request per second and up to 50 ids per request. */
const MIN_GAP_MS = 1100;
const MAX_IDS = 50;
const DAY = 86_400;

/**
 * Relations that keep an entry in the same franchise, as ANN words them: "sequel" on the older entry,
 * "sequel of" on the newer one, and the same for side stories and summaries. Adaptations (manga),
 * remakes and the loose "related" links are left out.
 */
export const FRANCHISE_RELATIONS = new Set([
  "prequel",
  "prequel of",
  "sequel",
  "sequel of",
  "side story",
  "side story of",
  "summary",
  "summary of",
  "parent story",
  "full story",
]);

function text(node: XmlNode, type: string): string | null {
  const hit = node.children.find((c) => c.name === "info" && c.attrs.type === type);
  const t = hit?.text.trim();
  return t ? t : null;
}

/** The first YYYY[-MM[-DD]] in a "Vintage" line such as "2004-10-05 to 2012-03-27". */
export function firstDate(vintage: string | null): string | null {
  return vintage ? (/\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(vintage)?.[0] ?? null) : null;
}

export function parseEntry(node: XmlNode): AnimeEntry | null {
  const id = node.attrs.id;
  const name = node.attrs.name?.trim() || text(node, "Main title");
  if (!id || !name) return null;
  const numbers = text(node, "Number of episodes");
  const listed = childrenNamed(node, "episode")
    .map((e) => ({ number: Number(e.attrs.num), name: (e.children.find((c) => c.name === "title" && (!c.attrs.lang || c.attrs.lang === "EN"))?.text ?? "").trim() }))
    .filter((e) => Number.isInteger(e.number) && e.number > 0);
  const picture = node.children.find((c) => c.name === "info" && c.attrs.type === "Picture")?.attrs.src ?? null;
  const running = /(\d+)/.exec(text(node, "Running time") ?? "")?.[1];
  return {
    id,
    type: node.attrs.type ?? "",
    name,
    picture,
    plot: text(node, "Plot Summary") ?? "",
    genres: node.children.filter((c) => c.name === "info" && c.attrs.type === "Genres").map((c) => c.text.trim().toLowerCase()),
    episodes: numbers && Number(numbers) > 0 ? Number(numbers) : listed.length > 0 ? Math.max(...listed.map((e) => e.number)) : null,
    start: firstDate(text(node, "Vintage")),
    runtimeMinutes: running ? Number(running) : null,
    related: node.children
      .filter((c) => c.name === "related-prev" || c.name === "related-next")
      .map((c) => ({ id: c.attrs.id ?? "", rel: (c.attrs.rel ?? "").toLowerCase() }))
      .filter((r) => /^\d+$/.test(r.id)),
    episodeNames: listed.filter((e) => e.name),
  };
}

/** Every anime entry in an api.xml answer. Manga results and warnings are ignored. */
export function parseAnimeList(xml: string): AnimeEntry[] {
  const root = parseXml(xml);
  if (!root) return [];
  return childrenNamed(root, "anime")
    .map(parseEntry)
    .filter((e): e is AnimeEntry => e !== null);
}

/**
 * Anime News Network's Encyclopedia API (the public XML feed ANN documents).
 * Calls are spaced at least a second apart, answers are cached for a week by
 * Next, and any failure is an empty answer: the caller falls back to TMDB.
 */
export class AnnClient {
  private last = 0;
  constructor(
    private fetcher: Fetch = fetch,
    private userAgent = "CineLoop/1.0 (personal watch tracker)",
  ) {}

  async byIds(ids: readonly string[]): Promise<AnimeEntry[]> {
    const out: AnimeEntry[] = [];
    for (let i = 0; i < ids.length; i += MAX_IDS) {
      out.push(...(await this.get(`anime=${ids.slice(i, i + MAX_IDS).join("/")}`)));
    }
    return out;
  }

  /** Entries whose title contains `name`. */
  async search(name: string): Promise<AnimeEntry[]> {
    const q = name.trim();
    return q.length < 2 ? [] : this.get(`title=~${encodeURIComponent(q)}`);
  }

  private async get(query: string): Promise<AnimeEntry[]> {
    const wait = this.last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    try {
      const res = await this.fetcher(`${API}?${query}`, {
        headers: { Accept: "application/xml", "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 7 * DAY },
      } as RequestInit);
      if (!res.ok) return [];
      return parseAnimeList(await res.text());
    } catch (err) {
      console.error("Anime News Network request failed", err);
      return [];
    }
  }
}
