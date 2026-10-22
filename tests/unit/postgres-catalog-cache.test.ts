import { describe, expect, it, vi } from "vitest";
import { PostgresRepository } from "@/server/data/postgres/postgres-repository";
import type { Title } from "@/domain/types";

function repositoryWithEmptyCatalog() {
  const orderBy = vi.fn(async () => []);
  const from = vi.fn(() => ({ orderBy }));
  const select = vi.fn(() => ({ from }));
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const repo = new PostgresRepository({ select, insert } as never);
  return { repo, select, orderBy, insert, values, onConflictDoUpdate };
}

const title: Title = {
  id: "test-title",
  type: "movie",
  title: "Test title",
  year: 2026,
  genres: [],
  overview: "",
  communityRating: null,
  artwork: { posterUrl: null, backdropUrl: null, palette: ["#000000", "#111111", "#222222"] },
  providers: [],
  runtimeMinutes: 90,
};

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
    const { repo, select, insert, values, onConflictDoUpdate } = repositoryWithEmptyCatalog();

    await repo.listTitles();
    await repo.upsertTitles([title]);
    await repo.listTitles();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
