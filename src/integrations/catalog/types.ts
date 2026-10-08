import type { Genre, MediaType, ProviderId, Release, Title } from "@/domain/types";

export type CatalogSort = "popular" | "top" | "recent";

export interface DiscoverQuery {
  type: MediaType | "all";
  genre: Genre | null;
  sort: CatalogSort;
  /** Only titles included in this service's subscription in Italy. */
  provider?: ProviderId | null;
  /** 1-based. Sources that cannot paginate return an empty page after the first. */
  page?: number;
}

/** What is known about a title read from a provider's player. */
export interface NamePreference {
  /** A season or episode was shown: it is a series. */
  series: boolean;
  /** The service it is playing on: among namesakes, the one available there wins. */
  provider: ProviderId;
}

export interface DiscoverPage {
  titles: Title[];
  /** True when the source has another page after this one. */
  hasMore: boolean;
}

/**
 * Where title metadata comes from. The app reads titles from the repository
 * (a local cache); a CatalogService only fills that cache. Swapping the demo
 * catalog for TMDB, or adding another source, never touches the UI.
 */
export interface CatalogService {
  readonly name: string;
  /** True when the source holds a real catalog, not just the bundled demo titles. */
  readonly complete: boolean;
  search(query: string, limit: number): Promise<Title[]>;
  getTitle(id: string): Promise<Title | null>;
  /** What people are watching now: the opening row of Esplora. */
  trending(limit: number): Promise<Title[]>;
  /** Browse by type, genre, service and order. */
  discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage>;
  /** Titles similar to ones the viewer already likes. Seeds can come from any source. */
  similarTo(seeds: readonly Title[], limit: number): Promise<Title[]>;
  /**
   * This source's version of a title from elsewhere (e.g. a bundled demo title
   * on TMDB), matched by name, type and year. Used for artwork and similarity.
   */
  match(title: Title): Promise<Title | null>;
  /**
   * For series the viewer has watched: the next season, when one is announced
   * (with its first air date, or a null date when it has none yet).
   * `today` is YYYY-MM-DD in Italy.
   */
  /**
   * The title a provider's player names, matched by its Italian or original
   * name; among namesakes, prefers the one available on `prefer.provider`.
   */
  findByName(name: string, prefer: NamePreference): Promise<Title | null>;
  nextSeasons(series: readonly Title[], today: string): Promise<Release[]>;
  /** Films and new series coming out after `today`, soonest first. */
  upcoming(type: MediaType | "all", today: string, limit: number): Promise<Release[]>;
}
