import "server-only";
import { MemoryRepository } from "./memory-repository";
import { createDb, PostgresRepository } from "./postgres/postgres-repository";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

const globalForRepo = globalThis as unknown as { __cineloopRepo?: Repository };
const globalForHomeCatalog = globalThis as unknown as { __cineloopHomeCatalogRepo?: { url: string; repository: Repository } };

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
 * The Home catalog can live on a separate, read-mostly database to reduce
 * catalog traffic on the primary Neon database. Personal data stays on the
 * primary repository. Without HOME_DATABASE_URL, behavior is unchanged.
 */
export function getHomeCatalogRepository(): Repository {
  const url = process.env.HOME_DATABASE_URL;
  if (!url) return getRepository();
  const current = globalForHomeCatalog.__cineloopHomeCatalogRepo;
  if (!current || current.url !== url) {
    globalForHomeCatalog.__cineloopHomeCatalogRepo = {
      url,
      repository: new PostgresRepository(createDb(url, 3)),
    };
  }
  return globalForHomeCatalog.__cineloopHomeCatalogRepo!.repository;
}

function createRepository(): Repository {
  const url = process.env.DATABASE_URL;
  return url ? new PostgresRepository(createDb(url)) : new MemoryRepository();
}
