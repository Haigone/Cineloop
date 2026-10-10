import type { Genre, Series } from "@/domain/types";

type Fetch = typeof fetch;

const API = "https://api.jikan.moe/v4";
const HOUR = 3600;

/** The fields of a Jikan anime record that CineLoop reads (Jikan serves MyAnimeList's public data). */
export interface JikanAnime {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  type?: string | null;
  episodes?: number | null;
  status?: string | null;
  duration?: string | null;
  synopsis?: string | null;
  year?: number | null;
  images?: { jpg?: { large_image_url?: string | null; image_url?: string | null } };
  aired?: { from?: string | null; prop?: { from?: { year?: number | null } } };
  genres?: { name: string }[];
}

export const MAL_ID = /^anime-mal-(\d+)$/;
export const malId = (n: number | string) => `anime-mal-${n}`;

const GENRES: Record<string, Genre> = {
  Action: "Azione",
  Adventure: "Avventura",
  Comedy: "Commedia",
  Drama: "Dramma",
  Fantasy: "Fantasy",
  Horror: "Horror",
  Mystery: "Mistero",
  Romance: "Romance",
  "Sci-Fi": "Fantascienza",
  Suspense: "Thriller",
};

/** Only series: films, OVAs, music videos and promos are not "what is airing this season". */
const SERIES_TYPES = new Set(["TV", "ONA"]);

/** First airing day (YYYY-MM-DD), or null when MyAnimeList has none yet. */
export function airDate(a: JikanAnime): string | null {
  return a.aired?.from ? a.aired.from.slice(0, 10) : null;
}

/** Every name the record goes by, for telling whether another catalogue already has it. */
export function namesOf(a: JikanAnime): string[] {
  return [a.title, a.title_english, a.title_japanese].filter((n): n is string => Boolean(n));
}

export function toSeries(a: JikanAnime): Series | null {
  const name = (a.title_english || a.title || "").trim();
  if (!name || !SERIES_TYPES.has(a.type ?? "")) return null;
  const date = airDate(a);
  const minutes = Number(/(\d+)\s*min/.exec(a.duration ?? "")?.[1]) || 24;
  const hue = (a.mal_id * 47) % 360;
  return {
    id: malId(a.mal_id),
    type: "anime",
    title: name,
    year: Number(date?.slice(0, 4)) || a.aired?.prop?.from?.year || a.year || 0,
    genres: [...new Set(["Animazione" as Genre, ...(a.genres ?? []).map((g) => GENRES[g.name]).filter((g): g is Genre => Boolean(g))])],
    overview: (a.synopsis ?? "").replace(/\s*\[Written by MAL Rewrite\]\s*$/, "").slice(0, 700),
    communityRating: null,
    artwork: {
      posterUrl: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
      backdropUrl: null,
      palette: [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`],
    },
    providers: [],
    seasons: [{ number: 1, episodeCount: a.episodes ?? 0, ...(date ? { airDate: date } : {}) }],
    episodeRuntimeMinutes: minutes,
  };
}

/** Jikan's open API for MyAnimeList data: no key, rate limited, answers cached for hours; a failure is an empty answer. */
export class JikanClient {
  constructor(
    private fetcher: Fetch = fetch,
    private userAgent = "CineLoop/1.0 (personal watch tracker)",
  ) {}

  /** Anime announced for coming seasons, soonest listed first. */
  async upcoming(limit = 25): Promise<JikanAnime[]> {
    const data = await this.get<{ data?: JikanAnime[] }>(`/seasons/upcoming?sfw=true&limit=${limit}`);
    return data?.data ?? [];
  }

  async byId(id: string): Promise<JikanAnime | null> {
    return (await this.get<{ data?: JikanAnime }>(`/anime/${id}`))?.data ?? null;
  }

  private async get<T>(path: string): Promise<T | null> {
    // Jikan is often slow and answers 429/5xx under load: wait longer, and ask once more on those.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetcher(`${API}${path}`, {
          headers: { Accept: "application/json", "User-Agent": this.userAgent },
          signal: AbortSignal.timeout(15000),
          next: { revalidate: 6 * HOUR },
        } as RequestInit);
        if (res.ok) return (await res.json()) as T;
        if (res.status !== 429 && res.status < 500) return null;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error("Jikan request failed", err);
        return null;
      }
    }
    return null;
  }
}
