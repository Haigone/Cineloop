import type { Genre, MediaType, Title } from "@/domain/types";
import { hashString } from "@/lib/hash";
import type { CatalogService, DiscoverQuery } from "./types";

/**
 * TMDB (themoviedb.org) catalog, via its official public API v3.
 * Requires a read access token (TMDB_READ_TOKEN). TMDB's terms require the
 * attribution "This product uses the TMDB API but is not endorsed or
 * certified by TMDB", shown in the app footer when this source is active.
 *
 * Ids are namespaced ("tmdb-movie-603", "tmdb-tv-1396") so they never clash
 * with other sources. List endpoints (search, trending, discover) carry
 * enough data for a card, so a grid costs one request, not one per title;
 * `getTitle` fetches the full record when a title page is opened.
 */

const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";

/** TMDB genre ids (movie and TV lists) mapped onto CineLoop genres. */
const GENRE_MAP: Record<number, Genre> = {
  28: "Azione",
  10759: "Azione",
  12: "Avventura",
  16: "Animazione",
  35: "Commedia",
  80: "Crime",
  18: "Dramma",
  878: "Fantascienza",
  10765: "Fantascienza",
  14: "Fantasy",
  27: "Horror",
  9648: "Mistero",
  10749: "Romance",
  53: "Thriller",
};

/**
 * The reverse map, for browsing. TMDB's TV list has no horror, romance or
 * thriller genre, so those browse films only.
 */
const GENRE_IDS: Record<Genre, { movie: number[]; tv: number[] }> = {
  Azione: { movie: [28], tv: [10759] },
  Animazione: { movie: [16], tv: [16] },
  Avventura: { movie: [12], tv: [10759] },
  Commedia: { movie: [35], tv: [35] },
  Crime: { movie: [80], tv: [80] },
  Dramma: { movie: [18], tv: [18] },
  Fantascienza: { movie: [878], tv: [10765] },
  Fantasy: { movie: [14], tv: [10765] },
  Horror: { movie: [27], tv: [] },
  Mistero: { movie: [9648], tv: [9648] },
  Romance: { movie: [10749], tv: [] },
  Thriller: { movie: [53], tv: [] },
};

/** Shape shared by list items and full records; details add the rest. */
interface TmdbItem {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  vote_average?: number | null;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string;
  /** List endpoints send ids; detail endpoints send objects. */
  genre_ids?: number[];
  genres?: { id: number }[];
  runtime?: number | null;
  episode_run_time?: number[];
  seasons?: { season_number: number; episode_count: number }[];
}

type Fetch = typeof fetch;

export class TmdbCatalog implements CatalogService {
  readonly name = "tmdb";
  readonly complete = true;
  constructor(
    private token: string,
    private language = "it-IT",
    private fetcher: Fetch = fetch,
  ) {}

  async search(query: string, limit: number): Promise<Title[]> {
    const q = query.trim();
    if (!q) return [];
    const data = await this.list(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
    return mapItems(data, limit);
  }

  async getTitle(id: string): Promise<Title | null> {
    const parsed = parseId(id);
    if (!parsed) return null;
    try {
      const details = await this.get<TmdbItem>(`/${parsed.kind}/${parsed.tmdbId}?`);
      return toTitle(parsed.kind, details);
    } catch {
      return null;
    }
  }

  async trending(limit: number): Promise<Title[]> {
    return mapItems(await this.list("/trending/all/week?"), limit);
  }

  async discover(query: DiscoverQuery, limit: number): Promise<Title[]> {
    const page = Math.max(1, query.page ?? 1);
    const kinds: ("movie" | "tv")[] = query.type === "movie" ? ["movie"] : query.type === "all" ? ["movie", "tv"] : ["tv"];
    const pages = await Promise.all(
      kinds.map(async (kind) => {
        const params = new URLSearchParams({ page: String(page), include_adult: "false", sort_by: sortParam(query.sort, kind) });
        // A minimum vote count keeps obscure entries with a single 10/10 out of "I più votati".
        if (query.sort === "top") params.set(kind === "movie" ? "vote_count.gte" : "vote_count.gte", "300");
        if (query.sort === "popular") params.set("vote_count.gte", "50");
        const ids = query.genre ? GENRE_IDS[query.genre][kind] : [];
        if (query.genre && ids.length === 0) return [];
        if (ids.length) params.set("with_genres", ids.join("|"));
        if (query.type === "anime") {
          params.set("with_original_language", "ja");
          params.set("with_genres", [...new Set([...ids, 16])].join(","));
        }
        const items = await this.list(`/discover/${kind}?${params}`);
        return items.map((i) => ({ ...i, media_type: kind }) as TmdbItem);
      }),
    );
    const merged = interleave(pages).filter((i) => (query.type === "anime" ? isAnime(i) : query.type !== "series" || !isAnime(i)));
    return mapItems(merged, limit);
  }

  async similarTo(seedIds: readonly string[], limit: number): Promise<Title[]> {
    const seeds = seedIds.map(parseId).filter((p): p is { kind: "movie" | "tv"; tmdbId: string } => p !== null);
    if (seeds.length === 0) return [];
    const lists = await Promise.all(
      seeds.map(async (s) => {
        try {
          return await this.list(`/${s.kind}/${s.tmdbId}/recommendations?`).then((items) =>
            items.map((i) => ({ ...i, media_type: i.media_type ?? s.kind }) as TmdbItem),
          );
        } catch {
          return [];
        }
      }),
    );
    // Round-robin across seeds so one favourite cannot fill the whole row.
    return mapItems(interleave(lists), limit);
  }

  private async list(path: string): Promise<TmdbItem[]> {
    try {
      const data = await this.get<{ results?: TmdbItem[] }>(path);
      return data.results ?? [];
    } catch (err) {
      console.error("TMDB request failed", err);
      return [];
    }
  }

  private async get<T>(path: string): Promise<T> {
    const sep = path.includes("?") ? (path.endsWith("?") ? "" : "&") : "?";
    const res = await this.fetcher(`${API}${path}${sep}language=${this.language}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      // Catalog data changes slowly; let the platform cache it for a day.
      next: { revalidate: 86_400 },
    } as RequestInit);
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }
}

function parseId(id: string): { kind: "movie" | "tv"; tmdbId: string } | null {
  const m = /^tmdb-(movie|tv)-(\d+)$/.exec(id);
  return m ? { kind: m[1] as "movie" | "tv", tmdbId: m[2]! } : null;
}

function sortParam(sort: DiscoverQuery["sort"], kind: "movie" | "tv") {
  if (sort === "top") return "vote_average.desc";
  if (sort === "recent") return kind === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  return "popularity.desc";
}

/** Takes one from each list in turn, so every source is represented early. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]!);
  }
  return out;
}

function isAnime(i: TmdbItem) {
  const genres = i.genre_ids ?? i.genres?.map((g) => g.id) ?? [];
  return i.original_language === "ja" && genres.includes(16);
}

function mapItems(items: TmdbItem[], limit: number): Title[] {
  const out: Title[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.media_type !== "movie" && item.media_type !== "tv") continue;
    const title = toTitle(item.media_type, item);
    // Entries without a name are placeholders TMDB has not filled in yet.
    if (!title.title || seen.has(title.id)) continue;
    seen.add(title.id);
    out.push(title);
    if (out.length >= limit) break;
  }
  return out;
}

/** Pure mapping, exported for tests. Works for list items and full records. */
export function toTitle(kind: "movie" | "tv", d: TmdbItem): Title {
  const ids = d.genres?.map((g) => g.id) ?? d.genre_ids ?? [];
  const genres = [...new Set(ids.map((id) => GENRE_MAP[id]).filter((g): g is Genre => Boolean(g)))];
  const date = d.release_date || d.first_air_date || "";
  const base = {
    id: `tmdb-${kind}-${d.id}`,
    title: (d.title ?? d.name ?? "").trim(),
    year: Number(date.slice(0, 4)) || 0,
    genres: genres.length ? genres : (["Dramma"] as Genre[]),
    overview: d.overview ?? "",
    communityRating: d.vote_count === 0 || d.vote_average == null ? null : Math.round(d.vote_average * 10) / 10,
    artwork: {
      posterUrl: d.poster_path ? `${IMAGE}/w500${d.poster_path}` : null,
      backdropUrl: d.backdrop_path ? `${IMAGE}/w1280${d.backdrop_path}` : null,
      palette: paletteFor(d.id),
    },
    // Where to watch needs a separate, region-specific call; left empty until wired.
    providers: [],
  };
  if (kind === "movie") return { ...base, type: "movie", runtimeMinutes: d.runtime ?? 0 };
  return {
    ...base,
    type: (isAnime(d) ? "anime" : "series") as Exclude<MediaType, "movie">,
    seasons: (d.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, episodeCount: s.episode_count })),
    episodeRuntimeMinutes: d.episode_run_time?.[0] ?? 0,
  };
}

/** Fallback colours for generated art while a poster loads or is missing. */
function paletteFor(id: number): readonly [string, string, string] {
  const hue = hashString(String(id)) % 360;
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`];
}
