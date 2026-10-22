import { describe, expect, it, vi } from "vitest";
import { PostgresRepository } from "@/server/data/postgres/postgres-repository";

function repositoryWithEmptyCatalog() {
  const orderBy = vi.fn(async () => []);
  const from = vi.fn(() => ({ orderBy }));
  const select = vi.fn(() => ({ from }));
  const repo = new PostgresRepository({ select } as never);
  return { repo, select, orderBy };
}

describe("Postgres catalog cache", () => {
  it("shares one in-flight listTitles query and caches the result", async () => {
    const { repo, select, orderBy } = repositoryWithEmptyCatalog();

    const [first, second] = await Promise.all([repo.listTitles(), repo.listTitles()]);
    const third = await repo.listTitles();

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(third).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  it("invalidates the catalog cache after title writes", async () => {
    const { repo, select } = repositoryWithEmptyCatalog();

    await repo.listTitles();
    await repo.upsertTitles([]);
    await repo.listTitles();

    // An empty upsert makes no catalog change, so the existing cache is retained.
    expect(select).toHaveBeenCalledTimes(1);
  });
});
