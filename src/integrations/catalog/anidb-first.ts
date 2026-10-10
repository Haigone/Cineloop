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
  fillerListUrl: string;
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
    fillerListUrl: `https://www.animefillerlist.com/shows/${encodeURIComponent((record.title_english || record.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))}`,
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

/** Search the AniDB title index. A bounded index is cached; it is not fetched on each keystroke. */
export async function searchAniDbAnime(query: string, limit = 12): Promise<AnimeIdentity[]> {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  try {
    const ids = await cachedJson<{ anidb_id: number; title: string }[]>("anidb:ids", `${API}/anidb/ids`);
    const candidates = ids
      .filter((item) => item.title.toLocaleLowerCase().includes(q))
      .slice(0, Math.min(20, Math.max(1, limit)));
    const records = await Promise.all(candidates.map((item) => getAniDbAnime(item.anidb_id)));
    return records.filter((record): record is AnimeIdentity => record !== null).slice(0, limit);
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
  const match = new RegExp(`\\\\b${attribute}="([^"]*)"`).exec(tag);
  return match?.[1]?.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">") ?? null;
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
    const xml = await response.text();
    const tag = /<anime\\b[^>]*>/i.exec(xml)?.[0];
    if (!tag || xml.includes("<error")) return null;
    const episodeCount = [...xml.matchAll(/<episode\\b[^>]*>/gi)].length;
    const pictureTag = [...xml.matchAll(/<info\\b[^>]*type="Picture"[^>]*>/gi)][0]?.[0];
    const result: AnnEnrichment = {
      id,
      title: xmlAttribute(tag, "name"),
      format: xmlAttribute(tag, "type"),
      episodeCount: episodeCount || null,
      pictureUrl: pictureTag ? xmlAttribute(pictureTag, "src") : null,
      url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${id}`,
    };
    cache.set(key, { value: result, expires: Date.now() + 60 * 60_000 });
    return result;
  } catch {
    return null;
  }
}
