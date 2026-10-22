import { describe, expect, it, vi } from "vitest";
import { PostgresRepository, titleToRow } from "@/server/data/postgres/postgres-repository";
import { SEED_TITLES } from "@/server/data/seed/catalog";

vi.mock("server-only", () => ({}));

describe("PostgresRepository.listTitles", () => {
  it("reads the catalogue from the database once, not on every call", async () => {
    const rows = SEED_TITLES.slice(0, 3).map(titleToRow);
    const orderBy = vi.fn(() => Promise.resolve(rows));
    const db = { select: () => ({ from: () => ({ orderBy }) }) };
    const repo = new PostgresRepository(db as never);

    const first = await repo.listTitles();
    const second = await repo.listTitles();
    await Promise.all([repo.listTitles(), repo.listTitles()]);

    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(3);
    expect(second).not.toBe(first);
  });
});
