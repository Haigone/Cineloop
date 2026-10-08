import { describe, expect, it } from "vitest";
import { fetchNetflixTop10, parseTop10 } from "@/integrations/netflix-top10";
import { MemoryRepository } from "@/server/data/memory-repository";

const HEADER = "country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\tcumulative_weeks_in_top_10";
const tsv = [
  HEADER,
  "Italy\tIT\t2026-09-27\tFilms\t1\tVecchio film\tN/A\t2",
  "Italy\tIT\t2026-10-04\tTV\t2\tDark\tDark: Stagione 1\t1",
  "Italy\tIT\t2026-10-04\tFilms\t1\tInterstellar\tN/A\t1",
  "Italy\tIT\t2026-10-04\tTV\t1\tStranger Things\tStranger Things: Stagione 4\t3",
  "France\tFR\t2026-10-04\tFilms\t1\tAutre\tN/A\t1",
];

describe("Netflix Top 10 data", () => {
  it("keeps the latest week for one country, films first, in rank order", () => {
    const chart = parseTop10(tsv, "IT");
    expect(chart?.week).toBe("2026-10-04");
    expect(chart?.rows.map((r) => `${r.category}:${r.rank}:${r.name}`)).toEqual(["film:1:Interstellar", "tv:1:Stranger Things", "tv:2:Dark"]);
    expect(chart?.rows[0]?.season).toBeNull();
    expect(chart?.rows[1]?.season).toBe("Stranger Things: Stagione 4");
  });

  it("refuses a file whose columns changed instead of guessing", () => {
    expect(parseTop10(["a\tb\tc", "1\t2\t3"], "IT")).toBeNull();
    expect(parseTop10([HEADER], "IT")).toBeNull();
  });

  it("streams the download and only keeps the country's lines", async () => {
    const body = tsv.join("\r\n");
    const fetcher = async () => new Response(new Blob([body]).stream());
    const chart = await fetchNetflixTop10("IT", fetcher as unknown as typeof fetch);
    expect(chart.rows).toHaveLength(3);
    await expect(fetchNetflixTop10("IT", (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("CineLoop's own Netflix chart", () => {
  it("ranks titles by how many people watched them on Netflix, respecting privacy", async () => {
    const repo = new MemoryRepository();
    const since = new Date(Date.now() - 7 * 864e5);
    const at = new Date().toISOString();
    const base = { watchedAt: at, minutes: 50, season: 1, episode: 1 };
    await repo.addWatchEvent({ ...base, userId: "u_marco", titleId: "dark", providerId: "netflix" });
    await repo.addWatchEvent({ ...base, userId: "u_luca", titleId: "dark", providerId: "netflix" });
    await repo.addWatchEvent({ ...base, userId: "u_sara", titleId: "dark", providerId: "netflix" });
    await repo.addWatchEvent({ ...base, userId: "u_marco", titleId: "andor", providerId: "disney-plus" });

    const before = await repo.topWatched({ since, providerId: "netflix", limit: 50 });
    const dark = before.find((r) => r.titleId === "dark")!;
    expect(dark.viewers).toBeGreaterThanOrEqual(3);
    expect(before.every((r) => r.titleId !== "andor" || r.viewers === 0)).toBe(true);

    await repo.updatePreferences("u_sara", { shareActivity: false });
    const after = await repo.topWatched({ since, providerId: "netflix", limit: 50 });
    expect(after.find((r) => r.titleId === "dark")!.viewers).toBe(dark.viewers - 1);
  });
});
