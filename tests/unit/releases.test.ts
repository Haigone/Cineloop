import { describe, expect, it, vi } from "vitest";
import { SeedCatalog } from "@/integrations/catalog/seed-catalog";
import { TmdbCatalog, nextSeasonOf } from "@/integrations/catalog/tmdb-catalog";
import { addDays, countdownLabel, formatDay, italianDay } from "@/lib/dates";
import { SEED_TITLES } from "@/server/data/seed/catalog";

const TODAY = "2026-10-08";

function tmdbWith(route: (url: string) => unknown) {
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(route(url)), { status: 200 }));
  return { fetcher, tmdb: new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch) };
}

describe("dates", () => {
  it("counts down in days, then months", () => {
    expect(countdownLabel(TODAY, TODAY)).toBe("Oggi");
    expect(countdownLabel(addDays(TODAY, 1), TODAY)).toBe("Domani");
    expect(countdownLabel(addDays(TODAY, 12), TODAY)).toBe("Tra 12 giorni");
    expect(countdownLabel(addDays(TODAY, 95), TODAY)).toBe("Tra 3 mesi");
    expect(countdownLabel(addDays(TODAY, -2), TODAY)).toBe("Uscito");
  });

  it("formats days in Italian, with the year only when it differs", () => {
    expect(formatDay("2026-11-14", TODAY)).toBe("14 novembre");
    expect(formatDay("2027-02-01", TODAY)).toBe("1 febbraio 2027");
  });

  it("uses the Italian calendar day", () => {
    // 23:30 UTC on 8 October is already 9 October in Rome.
    expect(italianDay(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
  });
});

describe("next season", () => {
  const base = { id: 1, name: "Show", status: "Returning Series", last_episode_to_air: { season_number: 4, episode_number: 8 } };

  it("uses the scheduled first episode of the next season", () => {
    expect(nextSeasonOf({ ...base, next_episode_to_air: { season_number: 5, episode_number: 1, air_date: "2026-11-02" } }, TODAY)).toEqual({
      season: 5,
      date: "2026-11-02",
    });
  });

  it("reports a renewed season without a date", () => {
    const seasons = [{ season_number: 4, episode_count: 8, air_date: "2024-06-13" }, { season_number: 5, episode_count: 0, air_date: null }];
    expect(nextSeasonOf({ ...base, seasons }, TODAY)).toEqual({ season: 5, date: null });
  });

  it("ignores mid-season episodes and ended shows", () => {
    expect(nextSeasonOf({ ...base, next_episode_to_air: { season_number: 4, episode_number: 9, air_date: "2026-10-10" } }, TODAY)).toBeNull();
    expect(nextSeasonOf({ ...base, status: "Ended", seasons: [{ season_number: 5, episode_count: 0, air_date: null }] }, TODAY)).toBeNull();
  });

  it("looks bundled series up on TMDB before asking for their details", async () => {
    const { tmdb, fetcher } = tmdbWith((url) =>
      url.includes("/search/tv")
        ? { results: [{ id: 1399, name: "The Boys", first_air_date: "2019-07-25" }] }
        : { ...base, id: 1399, next_episode_to_air: { season_number: 5, episode_number: 1, air_date: "2026-11-02" } },
    );
    const boys = SEED_TITLES.find((t) => t.id === "the-boys")!;
    const [release] = await tmdb.nextSeasons([boys], TODAY);
    expect(release).toMatchObject({ title: { id: "the-boys" }, season: 5, date: "2026-11-02" });
    expect(fetcher.mock.calls.map((c) => String(c[0]))[1]).toContain("/tv/1399?");
  });

  it("has example announcements in the demo catalog, relative to today", async () => {
    const boys = SEED_TITLES.find((t) => t.id === "the-boys")!;
    const dune = SEED_TITLES.find((t) => t.id === "dune-part-two")!;
    const out = await new SeedCatalog().nextSeasons([boys, dune], TODAY);
    expect(out).toEqual([{ title: boys, season: 5, date: addDays(TODAY, 12) }]);
  });
});

describe("browsing a service's catalogue", () => {
  it("asks TMDB for titles included with Netflix in Italy and reports more pages", async () => {
    const { tmdb, fetcher } = tmdbWith(() => ({ total_pages: 40, results: [{ id: 5, title: "Film", release_date: "2024-01-01" }] }));
    const page = await tmdb.discover({ type: "movie", genre: null, provider: "netflix", sort: "popular" }, 20);
    const url = String(fetcher.mock.calls[0]![0]);
    expect(url).toContain("with_watch_providers=8");
    expect(url).toContain("watch_region=IT");
    expect(url).toContain("with_watch_monetization_types=flatrate");
    expect(page.hasMore).toBe(true);
    expect(page.titles[0]!.providers).toEqual(["netflix"]);
  });

  it("filters the demo catalogue by service", async () => {
    const page = await new SeedCatalog().discover({ type: "all", genre: null, provider: "netflix", sort: "popular" }, 100);
    expect(page.titles.length).toBeGreaterThan(5);
    expect(page.titles.every((t) => t.providers.includes("netflix"))).toBe(true);
    expect(page.hasMore).toBe(false);
  });

  it("reads where a title streams from its details", async () => {
    const { tmdb } = tmdbWith(() => ({
      id: 66732,
      name: "Stranger Things",
      first_air_date: "2016-07-15",
      "watch/providers": { results: { IT: { flatrate: [{ provider_id: 8 }, { provider_id: 9999 }] }, US: { flatrate: [{ provider_id: 337 }] } } },
    }));
    expect((await tmdb.getTitle("tmdb-tv-66732"))!.providers).toEqual(["netflix"]);
  });
});

describe("upcoming releases", () => {
  it("lists future films with their Italian date and new series, soonest first", async () => {
    const { tmdb } = tmdbWith((url) => {
      if (url.includes("/discover/movie")) return { results: [{ id: 10, title: "Film", release_date: "2026-10-20" }] };
      if (url.includes("/discover/tv")) return { results: [{ id: 20, name: "Serie", first_air_date: "2026-10-15" }] };
      if (url.includes("/release_dates"))
        return { results: [{ iso_3166_1: "IT", release_dates: [{ type: 3, release_date: "2026-09-01T00:00:00.000Z" }, { type: 3, release_date: "2026-10-30T00:00:00.000Z" }] }] };
      return {};
    });
    const out = await tmdb.upcoming("all", TODAY, 10);
    expect(out.map((r) => [r.title.title, r.date])).toEqual([
      ["Serie", "2026-10-15"],
      ["Film", "2026-10-30"],
    ]);
  });

  it("paginates upcoming releases and chooses a future Italian date instead of an old re-release date", async () => {
    const { tmdb, fetcher } = tmdbWith((url) => {
      if (url.includes("/discover/movie")) {
        const page = new URL(url).searchParams.get("page");
        return {
          total_pages: 2,
          results: page === "2"
            ? [{ id: 11, title: "Secondo film", release_date: "2026-10-21" }]
            : [{ id: 10, title: "Primo film", release_date: "2026-10-20" }],
        };
      }
      if (url.includes("/discover/tv")) return { total_pages: 1, results: [] };
      if (url.includes("/movie/10/release_dates")) return { results: [{ iso_3166_1: "IT", release_dates: [
        { type: 3, release_date: "2026-09-01T00:00:00.000Z" },
        { type: 3, release_date: "2026-10-30T00:00:00.000Z" },
      ] }] };
      if (url.includes("/movie/11/release_dates")) return { results: [{ iso_3166_1: "IT", release_dates: [
        { type: 3, release_date: "2026-10-31T00:00:00.000Z" },
      ] }] };
      return {};
    });
    const out = await tmdb.upcoming("movie", TODAY, 10);
    expect(out.map((r) => [r.title.title, r.date])).toEqual([
      ["Primo film", "2026-10-30"],
      ["Secondo film", "2026-10-31"],
    ]);
    expect(fetcher.mock.calls.some((call) => new URL(String(call[0])).searchParams.get("page") === "2")).toBe(true);
  });
});

describe("recognising what the player names", () => {
  it("prefers the namesake that streams on Netflix in Italy, and matches the original name", async () => {
    const { tmdb } = tmdbWith((url) => {
      if (url.includes("/search/multi"))
        return {
          results: [
            { id: 1, media_type: "tv", name: "Mercoledì", original_name: "Wednesday", first_air_date: "1990-01-01" },
            { id: 119051, media_type: "tv", name: "Mercoledì", original_name: "Wednesday", first_air_date: "2022-11-23" },
            { id: 9, media_type: "movie", title: "Wednesday", release_date: "2010-01-01" },
          ],
        };
      if (url.includes("/tv/119051/watch/providers")) return { results: { IT: { flatrate: [{ provider_id: 8 }] } } };
      return { results: {} };
    });
    const hit = await tmdb.findByName("Wednesday", { series: true, provider: "netflix" });
    expect(hit).toMatchObject({ id: "tmdb-tv-119051", providers: ["netflix"] });
  });

  it("with no exact name, takes the only result on the service", async () => {
    const { tmdb } = tmdbWith((url) => {
      if (url.includes("/search/multi"))
        return { results: [{ id: 5, media_type: "tv", name: "La casa di carta: Corea" }, { id: 71446, media_type: "tv", name: "La casa di carta" }] };
      if (url.includes("/tv/71446/watch/providers")) return { results: { IT: { flatrate: [{ provider_id: 8 }] } } };
      return { results: {} };
    });
    expect((await tmdb.findByName("Money Heist", { series: true, provider: "netflix" }))?.id).toBe("tmdb-tv-71446");
  });

  it("reads \"Show: Part\" as the show when the part has no title of its own, and the part as its season", async () => {
    const { tmdb } = tmdbWith((url) => {
      if (url.includes("/search/multi") && /steel/i.test(url)) return { results: [] };
      if (url.includes("/search/multi")) return { results: [{ id: 45790, media_type: "tv", name: "Le bizzarre avventure di JoJo" }] };
      return { results: {} };
    });
    const hit = await tmdb.findByName("Le bizzarre avventure di JoJo: Steel Ball Run", { series: true, provider: "netflix" });
    expect(hit?.id).toBe("tmdb-tv-45790");
    // As Netflix's player writes it: the part, a dash, the show.
    expect((await tmdb.findByName("STEEL BALL RUN - Le bizzarre avventure di JoJo", { series: true, provider: "netflix" }))?.id).toBe("tmdb-tv-45790");

    const { seasonFromLabel } = await import("@/domain/presence");
    const jojo = {
      ...hit!,
      type: "anime" as const,
      seasons: [
        { number: 4, episodeCount: 39, name: "Golden Wind" },
        { number: 5, episodeCount: 38, name: "Stone Ocean" },
        { number: 6, episodeCount: 24, name: "Steel Ball Run" },
      ],
      episodeRuntimeMinutes: 24,
    };
    expect(seasonFromLabel(jojo, "Le bizzarre avventure di JoJo: Steel Ball Run")).toBe(6);
    expect(seasonFromLabel(jojo, "STEEL BALL RUN - Le bizzarre avventure di JoJo")).toBe(6);
    expect(seasonFromLabel(jojo, "Le bizzarre avventure di JoJo")).toBeNull();
  });
});
