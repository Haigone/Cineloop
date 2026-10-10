import "server-only";

/**
 * AniDB-first identity resolver.
 *
 * The public animap mirror exposes AniDB IDs, alternate titles, ANN IDs,
 * TMDB cross-links and relation edges. We keep its records as the identity
 * layer and treat ANN as enrichment, never as the anime catalogue's owner.
 */
export type AnimeRelationType =
  | "sequel" | "prequel" | "side_story" | "parent_story"
  | "alternative_setting" | "alternative_version" | "character"
  | "summary" | "full_story" | "other";

export interface AniDbRelation {
  anidb_id: number;
  type: string;
}

export interface AniDbRecord {
  anidb_id: number;
  title: string;
  title_english?: string | null;
  title_native?: string | null;
  synonyms?: string[] | null;
  type?: string | null;
  startyear?: number | null;
  episodecount?: number | null;
  picture?: string | null;
  url?: string | null;
  ann_ids?: number[] | null;
  tmdb_ids?: { id: number; type: "tv" | "movie" }[] | null;
  relatedanime?: AniDbRelation[] | null;
}

export interface AnimeIdentity {
  id: string;
  anidbId: number;
  title: string;
  alternateTitles: string[];
  year: number | null;
  format: string | null;
  episodeCount: number | null;
  posterUrl: string | null;
  annIds: number[];
  tmdbIds: { id: number; type: "tv" | "movie" }[];
  relations: { id: string; type: string }[];
  fillerListUrl: string | null;
  anidbUrl: string;
}

const API = "https://animap.id/api";
const TTL = 15 * 60_000;
const cache = new Map<string, { expires: number; value: unknown }>();

async function cachedJson<T>(key: string, url: string): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "CineLoop/1.0 anime-catalog" },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`Anime metadata source returned ${response.status}`);
  const value = await response.json() as T;
  cache.set(key, { value, expires: Date.now() + TTL });
  return value;
}

const FILLER_LIST_SLUGS: Record<string, string> = {
  "attack on titan": "attack-on-titan",
  "bleach": "bleach",
  "black clover": "black-clover",
  "boruto naruto next generations": "boruto-naruto-next-generations",
  "demon slayer kimetsu no yaiba": "demon-slayer-kimetsu-no-yaiba",
  "dragon ball z": "dragon-ball-z",
  "fairy tail": "fairy-tail",
  "hunter x hunter": "hunter-x-hunter-2011",
  "jujutsu kaisen": "jujutsu-kaisen",
  "my hero academia": "my-hero-academia",
  "naruto": "naruto",
  "naruto shippuden": "naruto-shippuden",
  "one piece": "one-piece",
  "one punch man": "one-punch-man",
};

export function fillerListUrlFor(title: string): string | null {
  const key = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  const slug = FILLER_LIST_SLUGS[key];
  return slug ? `https://www.animefillerlist.com/shows/${slug}` : null;
}

function toIdentity(record: AniDbRecord): AnimeIdentity {
  return {
    id: `anidb-${record.anidb_id}`,
    anidbId: record.anidb_id,
    title: record.title_english || record.title || `Anime ${record.anidb_id}`,
    alternateTitles: [...new Set([record.title, record.title_native, ...(record.synonyms ?? [])].filter((x): x is string => Boolean(x)))],
    year: record.startyear ?? null,
    format: record.type ?? null,
    episodeCount: record.episodecount ?? null,
    posterUrl: record.picture ? (record.picture.startsWith("http") ? record.picture : `https://cdn.anidb.net/images/main/${record.picture}`) : null,
    annIds: record.ann_ids ?? [],
    tmdbIds: record.tmdb_ids ?? [],
    relations: (record.relatedanime ?? []).map((relation) => ({ id: `anidb-${relation.anidb_id}`, type: relation.type })),
    fillerListUrl: fillerListUrlFor(record.title_english || record.title || ""),
    anidbUrl: `https://anidb.net/anime/${record.anidb_id}`,
  };
}

/** Fetch a canonical AniDB record and its graph edges. */
export async function getAniDbAnime(id: number): Promise<AnimeIdentity | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  try {
    const record = await cachedJson<AniDbRecord>(`anidb:${id}`, `${API}/anidb/${id}`);
    if (!record || record.anidb_id !== id) return null;
    return toIdentity(record);
  } catch {
    return null;
  }
}

/** Resolve the AniDB work associated with a TMDB id using AniMap's cross-service mapping. */
export async function getAniDbAnimeForTmdb(tmdbId: number, type: "tv" | "movie"): Promise<AnimeIdentity | null> {
  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) return null;
  try {
    type Mapping = { anidb_id?: number[]; tmdb_id?: { id: number; type: "tv" | "movie" }[] };
    const value = await cachedJson<Mapping | Mapping[]>(`tmdb-map:${type}:${tmdbId}`, `${API}/map/tmdb/${tmdbId}`);
    const records = Array.isArray(value) ? value : [value];
    const ids = [...new Set(records
      .filter((record) => record.tmdb_id?.some((item) => item.id === tmdbId && item.type === type))
      .flatMap((record) => record.anidb_id ?? []))];
    for (const id of ids) {
      const anime = await getAniDbAnime(id);
      if (anime) return anime;
    }
    return null;
  } catch {
    return null;
  }
}

/** Search the AniDB title index. A bounded index is cached; it is not fetched on each keystroke. */
export async function searchAniDbAnime(query: string, limit = 12): Promise<AnimeIdentity[]> {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  try {
    const ids = await cachedJson<{ anidb_id: number; title: string }[]>("anidb:ids", `${API}/anidb/ids`);
    const normalize = (value: string) => value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
    const normalizedQuery = normalize(q);
    const titleMatches = ids.filter((item) => normalize(item.title).includes(normalizedQuery));
    // Keep the metadata fan-out bounded, but inspect a small extra batch so English/native
    // titles and AniDB synonyms can rank even when the canonical romaji title differs.
    const candidates = [...new Map([
      ...titleMatches.slice(0, Math.min(20, Math.max(1, limit * 2))),
      ...ids.filter((item) => normalize(item.title).startsWith(normalizedQuery.slice(0, Math.min(3, normalizedQuery.length)))).slice(0, 30),
    ].map((item) => [item.anidb_id, item])).values()].slice(0, 40);
    const records = await Promise.all(candidates.map((item) => getAniDbAnime(item.anidb_id)));
    return records
      .filter((record): record is AnimeIdentity => record !== null)
      .filter((record) => [record.title, ...record.alternateTitles].some((title) => normalize(title).includes(normalizedQuery)))
      .sort((a, b) => {
        const aExact = [a.title, ...a.alternateTitles].some((title) => normalize(title) === normalizedQuery) ? 0 : 1;
        const bExact = [b.title, ...b.alternateTitles].some((title) => normalize(title) === normalizedQuery) ? 0 : 1;
        return aExact - bExact || (a.year ?? 9999) - (b.year ?? 9999);
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}


export interface AnnEnrichment {
  id: number;
  title: string | null;
  format: string | null;
  episodeCount: number | null;
  pictureUrl: string | null;
  url: string;
}

let lastAnnRequestAt = 0;

function xmlAttribute(tag: string, attribute: string): string | null {
  const match = new RegExp(`\\b${attribute}="([^"]*)"`).exec(tag);
  return match?.[1]?.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&apos;", "'") ?? null;
}

/** Parse the subset of ANN XML we display; exported so malformed feeds can be regression-tested. */
export function parseAnnXml(id: number, xml: string): AnnEnrichment | null {
  const tag = /<anime\b[^>]*>/i.exec(xml)?.[0];
  if (!tag || /<error\b/i.test(xml)) return null;
  const episodeCount = [...xml.matchAll(/<episode\b[^>]*>/gi)].length;
  const pictureTag = [...xml.matchAll(/<info\b[^>]*type="Picture"[^>]*>/gi)][0]?.[0];
  return {
    id,
    title: xmlAttribute(tag, "name"),
    format: xmlAttribute(tag, "type"),
    episodeCount: episodeCount || null,
    pictureUrl: pictureTag ? xmlAttribute(pictureTag, "src") : null,
    url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${id}`,
  };
}

/** ANN Encyclopedia XML enrichment, cached and rate-limited to avoid burst requests. */
export async function getAnnAnime(id: number): Promise<AnnEnrichment | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const key = `ann:${id}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as AnnEnrichment | null;

  try {
    const wait = Math.max(0, 1_050 - (Date.now() - lastAnnRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAnnRequestAt = Date.now();
    const response = await fetch(`https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=${id}`, {
      headers: { accept: "application/xml,text/xml", "user-agent": "CineLoop/1.0 (anime metadata attribution)" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 3_600 },
    });
    if (!response.ok) return null;
    const result = parseAnnXml(id, await response.text());
    if (!result) return null;
    cache.set(key, { value: result, expires: Date.now() + 60 * 60_000 });
    return result;
  } catch {
    return null;
  }
}
