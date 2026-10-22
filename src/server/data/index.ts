import "server-only";
import { MemoryRepository } from "./memory-repository";
import { createDb, PostgresRepository } from "./postgres/postgres-repository";
import type { Repository } from "./repository";
import type { Title } from "@/domain/types";

export type { Repository } from "./repository";

const globalForRepo = globalThis as unknown as { __cineloopRepo?: Repository };
const globalForHomeCatalog = globalThis as unknown as { __cineloopHomeCatalogCache?: { at: number; rows: Title[] } };

/**
 * Returns the process-wide repository. PostgreSQL when DATABASE_URL is set,
 * otherwise the in-memory demo store. Cached on globalThis so dev reloads
 * keep state.
 */
export function getRepository(): Repository {
  if (!globalForRepo.__cineloopRepo) {
    globalForRepo.__cineloopRepo = createRepository();
  }
  return globalForRepo.__cineloopRepo;
}

/**
 * Read the public title catalog from Supabase's REST API. Only a publishable
 * key is needed; RLS grants read access solely to the public titles table.
 * Personal data remains exclusively on the primary Neon repository.
 */
export async function getHomeCatalogTitles(): Promise<Title[] | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !apiKey) return null;

  const cached = globalForHomeCatalog.__cineloopHomeCatalogCache;
  if (cached && Date.now() - cached.at < 5 * 60_000) return [...cached.rows];

  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(
      `${baseUrl.replace(/\\/$/, "")}/rest/v1/titles?select=*&order=title.asc`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          Range: `${offset}-${offset + 999}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`Supabase catalog request failed: ${response.status}`);
    const batch = (await response.json()) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }

  const titles = rows.map((row) => {
    const palette = Array.isArray(row.palette) ? row.palette : ["#303030", "#101010", "#606060"];
    const base = {
      id: String(row.id),
      title: String(row.title ?? ""),
      year: Number(row.year ?? 0),
      genres: Array.isArray(row.genres) ? row.genres : [],
      overview: String(row.overview ?? ""),
      communityRating: row.community_rating == null ? null : Number(row.community_rating),
      artwork: {
        posterUrl: typeof row.poster_url === "string" ? row.poster_url : null,
        backdropUrl: typeof row.backdrop_url === "string" ? row.backdrop_url : null,
        palette: [String(palette[0]), String(palette[1]), String(palette[2])] as [string, string, string],
      },
      providers: Array.isArray(row.providers) ? row.providers : [],
      partOf: typeof row.part_of === "string" ? row.part_of : null,
    };
    if (row.type === "movie") {
      return {
        ...base,
        type: "movie" as const,
        runtimeMinutes: Number(row.runtime_minutes ?? 0),
        collection: row.collection_id && row.collection_name
          ? { id: String(row.collection_id), name: String(row.collection_name) }
          : null,
      };
    }
    return {
      ...base,
      type: (row.type === "anime" ? "anime" : "series") as "anime" | "series",
      seasons: Array.isArray(row.seasons) ? row.seasons : [],
      episodeRuntimeMinutes: Number(row.episode_runtime_minutes ?? 0),
      watchOrder: Array.isArray(row.watch_order) ? row.watch_order : [],
    };
  }) as Title[];

  globalForHomeCatalog.__cineloopHomeCatalogCache = { at: Date.now(), rows: titles };
  return [...titles];
}
function createRepository(): Repository {
  const url = process.env.DATABASE_URL;
  return url ? new PostgresRepository(createDb(url)) : new MemoryRepository();
}
