import "server-only";
import { MemoryRepository } from "./memory-repository";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

const globalForRepo = globalThis as unknown as { __cineloopRepo?: Repository };

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

function createRepository(): Repository {
  return new MemoryRepository();
}
