import { describe, expect, it, vi } from "vitest";
import type { Series, Title } from "@/domain/types";

const art = { posterUrl: null, backdropUrl: null, palette: ["#000", "#111", "#222"] as const };
const series = (id: string, title: string): Series => ({ id, type: "anime", title, year: 2004, genres: ["Animazione"], overview: "", communityRating: null, artwork: art, providers: [], seasons: [], episodeRuntimeMinutes: 24 });
const franchise = series("anime-ann-4658", "Bleach");

vi.mock("@/integrations/catalog", () => ({
  getCatalog: () => ({ name: "anime+tmdb", complete: true, search: async () => [franchise] as Title[] }),
}));

describe("search with the anime sources", () => {
  it("shows a franchise once, not beside the TMDB copies cached by earlier searches", async () => {
    const { getRepository } = await import("@/server/data");
    const { search } = await import("@/server/services/search");
    const repo = getRepository();
    const film: Title = { id: "tmdb-movie-21708", type: "movie", title: "Bleach: Memories of Nobody", year: 2006, genres: ["Animazione"], overview: "", communityRating: null, artwork: art, providers: [], runtimeMinutes: 90, partOf: "tmdb-tv-30984" };
    await repo.upsertTitles([series("tmdb-tv-30984", "Bleach"), series("tmdb-tv-207468", "Bleach: Thousand-Year Blood War"), film]);
    const viewer = (await repo.getUserById("u_marco"))!;
    const found = await search(viewer, "bleach");
    expect(found.titles.map((t) => t.id)).toEqual(["anime-ann-4658"]);
  });
});
