import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimeFirstCatalog } from "@/integrations/anime/anime-catalog";
import { JikanClient, toSeries, type JikanAnime } from "@/integrations/anime/jikan";
import type { Release, Title } from "@/domain/types";
import type { CatalogService } from "@/integrations/catalog/types";

afterEach(() => vi.restoreAllMocks());

// Fixtures follow Jikan's documented v4 shape (data[] of MyAnimeList records); not captured live.
const rec = (id: number, extra: Partial<JikanAnime> = {}): JikanAnime => ({
  mal_id: id, title: `Shin ${id}`, title_english: `New Show ${id}`, type: "TV", episodes: 12, status: "Not yet aired",
  duration: "23 min per ep", synopsis: "A plot. [Written by MAL Rewrite]", aired: { from: "2026-12-05T00:00:00+00:00" },
  genres: [{ name: "Action" }, { name: "Sci-Fi" }, { name: "Gourmet" }], images: { jpg: { large_image_url: "https://img/x.jpg" } }, ...extra,
});

const jikan = (data: JikanAnime[], byId: Record<string, JikanAnime> = {}) =>
  new JikanClient((async (url: string) => {
    const one = /\/anime\/(\d+)$/.exec(url);
    if (one) return byId[one[1]!] ? new Response(JSON.stringify({ data: byId[one[1]!] }), { status: 200 }) : new Response("", { status: 404 });
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch);

const known = { id: "tmdb-tv-1", type: "anime", title: "New Show 1" } as Title;
const base = (up: Release[] = []): CatalogService =>
  ({ name: "tmdb", complete: true, search: async () => [], getTitle: async () => null, nextSeasons: async () => [], related: async () => [], episodes: async () => null, upcoming: vi.fn(async () => up) }) as unknown as CatalogService;
const cat = (j: JikanClient, up: Release[] = []) => new AnimeFirstCatalog(base(up), undefined, undefined, j);
const TODAY = "2026-10-10";

describe("Jikan / MyAnimeList seasonal", () => {
  it("maps a record to a series with the first season dated", () => {
    const s = toSeries(rec(7))!;
    expect(s).toMatchObject({ id: "anime-mal-7", type: "anime", title: "New Show 7", year: 2026, episodeRuntimeMinutes: 23, providers: [] });
    expect(s.seasons).toEqual([{ number: 1, episodeCount: 12, airDate: "2026-12-05" }]);
    expect(s.genres).toEqual(expect.arrayContaining(["Animazione", "Azione", "Fantascienza"]));
    expect(s.overview).toBe("A plot.");
  });

  it("ignores films, OVAs and nameless records", () => {
    expect(toSeries(rec(8, { type: "Movie" }))).toBeNull();
    expect(toSeries(rec(9, { title: null, title_english: null }))).toBeNull();
  });

  it("adds the calendar's series to the upcoming list, without those the catalogue already has", async () => {
    const tmdb: Release = { title: known, date: "2026-11-01", season: null, venue: "streaming" };
    const c = cat(jikan([rec(1), rec(2), rec(3, { type: "Movie" })]), [tmdb]);
    const list = await c.upcoming("all", TODAY, 20);
    expect(list.map((r) => r.title.id)).toEqual(["tmdb-tv-1", "anime-mal-2"]);
    expect(list[1]).toMatchObject({ date: "2026-12-05", venue: "seasonal" });
  });

  it("leaves films and series untouched, and keeps at most 5 undated entries", async () => {
    const undated = [10, 11, 12, 13, 14, 15, 16].map((n) => rec(n, { aired: { from: null } }));
    const c = cat(jikan(undated));
    expect(await c.upcoming("movie", TODAY, 20)).toEqual([]);
    expect((await c.upcoming("anime", TODAY, 20)).length).toBe(5);
  });

  it("drops entries past the one-year horizon", async () => {
    const far = rec(20, { aired: { from: "2028-01-01T00:00:00+00:00" } });
    expect(await cat(jikan([far])).upcoming("all", TODAY, 20)).toEqual([]);
  });

  it("returns the title for a calendar id and the wait for its first season", async () => {
    const c = cat(jikan([], { "30": rec(30) }));
    expect((await c.getTitle("anime-mal-30"))?.title).toBe("New Show 30");
    const waits = await c.nextSeasons([{ id: "anime-mal-30" } as Title], TODAY);
    expect(waits).toMatchObject([{ date: "2026-12-05", season: 1 }]);
  });

  it("stops waiting once the show has aired", async () => {
    const c = cat(jikan([], { "31": rec(31, { status: "Currently Airing", aired: { from: "2026-10-01T00:00:00+00:00" } }) }));
    expect(await c.nextSeasons([{ id: "anime-mal-31" } as Title], TODAY)).toEqual([]);
  });

  it("an unreachable calendar is an empty list, not an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = new JikanClient((async () => { throw new Error("down"); }) as unknown as typeof fetch);
    expect(await cat(down).upcoming("all", TODAY, 20)).toEqual([]);
  });
});
