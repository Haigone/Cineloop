import { describe, expect, it, vi } from "vitest";
import type { Title } from "@/domain/types";
import { getRepository } from "@/server/data";
import { cacheTitles } from "@/server/services/explore";
import { importNetflixHistory } from "@/server/services/import-history";

// The franchise lookup asks ANN and AniList: here the TMDB anime "tmdb-tv-777" stands for the card "anime-ann-777", named differently.
vi.mock("@/server/services/anime-migration", () => ({
  asFranchise: async (t: Title) => (t.id === "tmdb-tv-777" ? { ...t, id: "anime-ann-777", title: "Mononoke Zeta: Il viaggio" } : t),
}));

describe("importing an anime the catalogue finds under its TMDB id", () => {
  it("files it under the franchise card the library already has, not a second entry", async () => {
    const repo = getRepository();
    const [dark] = await repo.getTitlesByIds(["dark"]);
    const base = { ...dark!, type: "anime" } as Title;
    await cacheTitles(repo, [
      { ...base, id: "tmdb-tv-777", title: "Mononoke Zeta" },
      { ...base, id: "anime-ann-777", title: "Mononoke Zeta: Il viaggio" },
    ]);
    await repo.setLibraryStatus("u_frieren", "anime-ann-777", "watching");
    const res = await importNetflixHistory("u_frieren", [{ title: "Mononoke Zeta", kind: "series", season: 1, sample: "Mononoke Zeta: Stagione 1: Inizio" }]);
    expect(res).toEqual({ added: [], already: 1, notFound: [] });
    expect((await repo.listLibrary("u_frieren")).map((e) => e.titleId)).toEqual(["anime-ann-777"]);
  });
});
