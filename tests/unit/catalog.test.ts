import { describe, expect, it, vi } from "vitest";
import { SeedCatalog } from "@/integrations/catalog/seed-catalog";
import { TmdbCatalog, toTitle } from "@/integrations/catalog/tmdb-catalog";

const details = {
  id: 1396,
  name: "Breaking Bad",
  first_air_date: "2008-01-20",
  overview: "…",
  vote_average: 8.9,
  vote_count: 1000,
  poster_path: "/p.jpg",
  backdrop_path: null,
  genres: [{ id: 18 }, { id: 80 }, { id: 99999 }],
  original_language: "en",
  episode_run_time: [47],
  seasons: [
    { season_number: 0, episode_count: 9 },
    { season_number: 1, episode_count: 7 },
  ],
};

describe("TMDB mapping", () => {
  it("maps a TV show onto a CineLoop series", () => {
    const t = toTitle("tv", details);
    expect(t).toMatchObject({
      id: "tmdb-tv-1396",
      type: "series",
      title: "Breaking Bad",
      year: 2008,
      genres: ["Dramma", "Crime"],
      communityRating: 8.9,
      seasons: [{ number: 1, episodeCount: 7 }],
      episodeRuntimeMinutes: 47,
    });
    expect(t.artwork.posterUrl).toBe("https://image.tmdb.org/t/p/w500/p.jpg");
    expect(t.artwork.backdropUrl).toBeNull();
  });

  it("treats Japanese animation as anime", () => {
    expect(toTitle("tv", { ...details, original_language: "ja", genres: [{ id: 16 }] }).type).toBe("anime");
  });

  it("sends the token, maps search hits in one request and skips people and unnamed entries", async () => {
    const fetcher = vi.fn(async () => {
      const results = [
        { id: 1396, media_type: "tv", name: "Breaking Bad", first_air_date: "2008-01-20", genre_ids: [18, 80] },
        { id: 7, media_type: "person", name: "Bryan Cranston" },
        { id: 8, media_type: "movie" },
      ];
      return new Response(JSON.stringify({ results }), { status: 200 });
    });
    const tmdb = new TmdbCatalog("secret", "it-IT", fetcher as unknown as typeof fetch);
    const res = await tmdb.search("breaking", 5);
    expect(res.map((t) => t.id)).toEqual(["tmdb-tv-1396"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain("query=breaking");
    expect(url).toContain("language=it-IT");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("matches a bundled title on TMDB by name and year, ignoring namesakes", async () => {
    const seed = (await new SeedCatalog().getTitle("dune-part-two"))!;
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            { id: 841, title: "Dune", original_title: "Dune", release_date: "1984-12-14", poster_path: "/old.jpg" },
            { id: 693134, title: "Dune - Parte due", original_title: "Dune: Part Two", release_date: "2024-02-27", poster_path: "/new.jpg" },
          ],
        }),
      ),
    );
    const tmdb = new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch);
    const match = await tmdb.match(seed);
    expect(match?.id).toBe("tmdb-movie-693134");
    expect(match?.artwork.posterUrl).toContain("/new.jpg");
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("/search/movie");
  });

  it("builds recommendations from bundled titles by matching them first", async () => {
    const seed = (await new SeedCatalog().getTitle("dark"))!;
    const fetcher = vi.fn(async (url: string) => {
      const body = url.includes("/search/tv")
        ? { results: [{ id: 70523, name: "Dark", first_air_date: "2017-12-01" }] }
        : { results: [{ id: 66732, media_type: "tv", name: "Stranger Things", first_air_date: "2016-07-15" }] };
      return new Response(JSON.stringify(body));
    });
    const tmdb = new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch);
    const recs = await tmdb.similarTo([seed], 5);
    expect(recs.map((t) => t.title)).toEqual(["Stranger Things"]);
    expect((fetcher.mock.calls as unknown[][]).some(([url]) => String(url).includes("/tv/70523/recommendations"))).toBe(true);
  });

  it("returns null for foreign ids and failed lookups", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    const tmdb = new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch);
    expect(await tmdb.getTitle("arcane")).toBeNull();
    expect(await tmdb.getTitle("tmdb-movie-1")).toBeNull();
  });
});

describe("SeedCatalog", () => {
  it("searches the demo catalog ignoring accents", async () => {
    const res = await new SeedCatalog().search("shogun", 5);
    expect(res.map((t) => t.title)).toContain("Shōgun");
  });
});

describe("caching catalog titles", () => {
  it("keeps a series' seasons when a search result without them is cached again", async () => {
    const { MemoryRepository } = await import("@/server/data/memory-repository");
    const { cacheTitles } = await import("@/server/services/explore");
    const repo = new MemoryRepository();
    const full = toTitle("tv", details);
    await cacheTitles(repo, [full]);
    await cacheTitles(repo, [{ ...full, seasons: [], episodeRuntimeMinutes: 0 } as typeof full]);
    const [cached] = await repo.getTitlesByIds([full.id]);
    expect(cached).toMatchObject({ seasons: [{ number: 1, episodeCount: 7 }], episodeRuntimeMinutes: 47 });
  });
});
