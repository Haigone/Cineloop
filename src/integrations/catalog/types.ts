import type { Genre, MediaType, Title } from "@/domain/types";

export type CatalogSort = "popular" | "top" | "recent";

export interface DiscoverQuery {
  type: MediaType | "all";
  genre: Genre | null;
  sort: CatalogSort;
  /** 1-based. Sources that cannot paginate return an empty page after the first. */
  page?: number;
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
  /** Browse by type, genre and order. */
  discover(query: DiscoverQuery, limit: number): Promise<Title[]>;
  /** Titles similar to ones the viewer already likes. Seeds can come from any source. */
  similarTo(seeds: readonly Title[], limit: number): Promise<Title[]>;
  /**
   * This source's version of a title from elsewhere (e.g. a bundled demo title
   * on TMDB), matched by name, type and year. Used for artwork and similarity.
   */
  match(title: Title): Promise<Title | null>;
}
