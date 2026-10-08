import type { Title } from "@/domain/types";

/**
 * Where title metadata comes from. The app reads titles from the repository
 * (a local cache); a CatalogService only fills that cache. Swapping the demo
 * catalog for TMDB, or adding another source, never touches the UI.
 */
export interface CatalogService {
  readonly name: string;
  /** Search the remote catalog. Results are full titles ready to cache. */
  search(query: string, limit: number): Promise<Title[]>;
  getTitle(id: string): Promise<Title | null>;
}
