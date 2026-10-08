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
