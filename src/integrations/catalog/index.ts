import { AnimeFirstCatalog } from "../anime/anime-catalog";
import { SeedCatalog } from "./seed-catalog";
import { TmdbCatalog } from "./tmdb-catalog";
import type { CatalogService } from "./types";

export type { CatalogService } from "./types";

let catalog: CatalogService | undefined;

/**
 * TMDB when TMDB_READ_TOKEN is set, otherwise the bundled demo catalog. With
 * TMDB, anime go to the anime sources first (ANIME_SOURCES=off turns that off).
 */
export function getCatalog(): CatalogService {
  if (!catalog) {
    const tmdb = process.env.TMDB_READ_TOKEN ? new TmdbCatalog(process.env.TMDB_READ_TOKEN) : null;
    catalog = tmdb ? (process.env.ANIME_SOURCES === "off" ? tmdb : new AnimeFirstCatalog(tmdb)) : new SeedCatalog();
  }
  return catalog;
}
