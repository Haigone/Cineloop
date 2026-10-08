import { SeedCatalog } from "./seed-catalog";
import { TmdbCatalog } from "./tmdb-catalog";
import type { CatalogService } from "./types";

export type { CatalogService } from "./types";

let catalog: CatalogService | undefined;

/** TMDB when TMDB_READ_TOKEN is set, otherwise the bundled demo catalog. */
export function getCatalog(): CatalogService {
  catalog ??= process.env.TMDB_READ_TOKEN ? new TmdbCatalog(process.env.TMDB_READ_TOKEN) : new SeedCatalog();
  return catalog;
}
