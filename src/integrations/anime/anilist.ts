import type { Genre, Series } from "@/domain/types";

type Fetch = typeof fetch;

const API = "https://graphql.anilist.co";
const HOUR = 3600;

/** The fields of an AniList anime record that CineLoop reads. */
export interface AniListAnime {
  id: number;
  idMal?: number | null;
  format?: string | null;
  status?: string | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  startDate?: { year?: number | null; month?: number | null; day?: number | null };
  episodes?: number | null;
  duration?: number | null;
  description?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null };
  genres?: string[];
}

export const AL_ID = /^anime-al-(\d+)$/;
export const alId = (n: number | string) => `anime-al-${n}`;

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
  Thriller: "Thriller",
};

const FIELDS = "id idMal format status title { romaji english native } startDate { year month day } episodes duration description(asHtml: false) coverImage { extraLarge large } genres";

/** First airing day (YYYY-MM-DD), or null when it is not fully announced. */
export function alDate(a: AniListAnime): string | null {
  const { year, month, day } = a.startDate ?? {};
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function alNames(a: AniListAnime): string[] {
  return [a.title?.english, a.title?.romaji, a.title?.native].filter((n): n is string => Boolean(n));
}

export function alSeries(a: AniListAnime): Series | null {
  const name = (a.title?.english || a.title?.romaji || "").trim();
  if (!name) return null;
  const date = alDate(a);
  const hue = (a.id * 47) % 360;
  return {
    id: alId(a.id),
    type: "anime",
    title: name,
    year: a.startDate?.year || 0,
    genres: [...new Set(["Animazione" as Genre, ...(a.genres ?? []).map((g) => GENRES[g]).filter((g): g is Genre => Boolean(g))])],
    overview: (a.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700),
    communityRating: null,
    artwork: {
      posterUrl: a.coverImage?.extraLarge || a.coverImage?.large || null,
      backdropUrl: null,
      palette: [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`],
    },
    providers: [],
    seasons: [{ number: 1, episodeCount: a.episodes ?? 0, ...(date ? { airDate: date } : {}) }],
    episodeRuntimeMinutes: a.duration || 24,
  };
}

/** AniList's open GraphQL API: no key, fast; a failure is an empty answer. */
export class AniListClient {
  constructor(private fetcher: Fetch = fetch) {}

  /** Announced TV/ONA series not out yet, the most followed first. */
  upcoming(): Promise<AniListAnime[]> {
    return this.page(`status: NOT_YET_RELEASED, sort: POPULARITY_DESC`);
  }

  /** The series airing now that people watch most this week. */
  trending(): Promise<AniListAnime[]> {
    return this.page(`status: RELEASING, sort: TRENDING_DESC`);
  }

  async byId(id: string): Promise<AniListAnime | null> {
    const data = await this.query<{ Media?: AniListAnime }>(`query { Media(id: ${Number(id)}, type: ANIME) { ${FIELDS} } }`);
    return data?.Media ?? null;
  }

  private async page(filter: string): Promise<AniListAnime[]> {
    const data = await this.query<{ Page?: { media?: AniListAnime[] } }>(
      `query { Page(page: 1, perPage: 30) { media(type: ANIME, format_in: [TV, ONA], isAdult: false, ${filter}) { ${FIELDS} } } }`,
    );
    return data?.Page?.media ?? [];
  }

  private async query<T>(query: string): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.fetcher(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(12000),
          next: { revalidate: 6 * HOUR },
        } as RequestInit);
        if (res.ok) return ((await res.json()) as { data?: T }).data ?? null;
        if (res.status !== 429 && res.status < 500) return null;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error("AniList request failed", err);
        return null;
      }
    }
    return null;
  }
}
