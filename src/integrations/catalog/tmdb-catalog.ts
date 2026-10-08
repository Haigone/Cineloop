import type { Genre, Title } from "@/domain/types";
import { hashString } from "@/lib/hash";
import type { CatalogService } from "./types";

/**
 * TMDB (themoviedb.org) catalog, via its official public API v3.
 * Requires a read access token (TMDB_READ_TOKEN). TMDB's terms require the
 * attribution "This product uses the TMDB API but is not endorsed or
 * certified by TMDB", shown in the app footer when this source is active.
 *
 * Ids are namespaced ("tmdb-movie-603", "tmdb-tv-1396") so they never clash
 * with other sources.
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

interface TmdbSearchItem {
  id: number;
  media_type: "movie" | "tv" | "person";
}

interface TmdbDetails {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  vote_average: number | null;
  vote_count?: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number }[];
  original_language: string;
  runtime?: number | null;
  episode_run_time?: number[];
  seasons?: { season_number: number; episode_count: number }[];
}

type Fetch = typeof fetch;

export class TmdbCatalog implements CatalogService {
  readonly name = "tmdb";
  constructor(
    private token: string,
    private language = "it-IT",
    private fetcher: Fetch = fetch,
  ) {}

  async search(query: string, limit: number): Promise<Title[]> {
    const q = query.trim();
    if (!q) return [];
    const data = await this.get<{ results: TmdbSearchItem[] }>(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
    const hits = data.results.filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, limit);
    const titles = await Promise.all(hits.map((h) => this.getTitle(`tmdb-${h.media_type}-${h.id}`)));
    return titles.filter((t): t is Title => t !== null);
  }

  async getTitle(id: string): Promise<Title | null> {
    const m = /^tmdb-(movie|tv)-(\d+)$/.exec(id);
    if (!m) return null;
    const [, kind, tmdbId] = m as unknown as [string, "movie" | "tv", string];
    try {
      return toTitle(kind, await this.get<TmdbDetails>(`/${kind}/${tmdbId}?`));
    } catch {
      return null;
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

/** Pure mapping, exported for tests. */
export function toTitle(kind: "movie" | "tv", d: TmdbDetails): Title {
  const genres = [...new Set(d.genres.map((g) => GENRE_MAP[g.id]).filter((g): g is Genre => Boolean(g)))];
  const date = d.release_date || d.first_air_date || "";
  const base = {
    id: `tmdb-${kind}-${d.id}`,
    title: (d.title ?? d.name ?? "").trim(),
    year: Number(date.slice(0, 4)) || 0,
    genres: genres.length ? genres : (["Dramma"] as Genre[]),
    overview: d.overview,
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
  const isAnime = d.original_language === "ja" && d.genres.some((g) => g.id === 16);
  return {
    ...base,
    type: isAnime ? "anime" : "series",
    seasons: (d.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, episodeCount: s.episode_count })),
    episodeRuntimeMinutes: d.episode_run_time?.[0] ?? 0,
  };
}

/** Fallback colours for generated art while a poster loads or is missing. */
function paletteFor(id: number): readonly [string, string, string] {
  const hue = hashString(String(id)) % 360;
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`];
}
