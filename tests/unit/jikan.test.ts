import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimeFirstCatalog } from "@/integrations/anime/anime-catalog";
import { JikanClient, toSeries, type JikanAnime } from "@/integrations/anime/jikan";
import { AniListClient, alSeries, type AniListAnime } from "@/integrations/anime/anilist";
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
  ({ name: "tmdb", complete: true, search: async () => [], getTitle: async () => null, nextSeasons: async () => [], trending: async () => [], related: async () => [], episodes: async () => null, upcoming: vi.fn(async () => up) }) as unknown as CatalogService;
const al = (media: AniListAnime[], one?: AniListAnime) =>
  new AniListClient((async (_url: string, init?: RequestInit) => {
    const q = String(JSON.parse(String(init?.body)).query);
    return new Response(JSON.stringify({ data: q.includes("Media(") ? { Media: one ?? null } : { Page: { media } } }), { status: 200 });
  }) as unknown as typeof fetch);
const cat = (j: JikanClient, up: Release[] = [], a = al([])) => new AnimeFirstCatalog(base(up), undefined, undefined, j, a);
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

  const rec2 = (id: number, extra: Partial<AniListAnime> = {}): AniListAnime => ({
    id, idMal: null, format: "TV", status: "NOT_YET_RELEASED", title: { english: `Fresh ${id}`, romaji: `Atarashii ${id}` },
    startDate: { year: 2027, month: 1, day: 9 }, episodes: 12, duration: 24, description: "<b>Plot</b><br>here", coverImage: { large: "https://s4.anilist.co/x.jpg" }, genres: ["Action"], ...extra,
  });

  it("maps an AniList record and strips the markup of its description", () => {
    const s = alSeries(rec2(5))!;
    expect(s).toMatchObject({ id: "anime-al-5", type: "anime", title: "Fresh 5", year: 2027, overview: "Plot here" });
    expect(s.seasons).toEqual([{ number: 1, episodeCount: 12, airDate: "2027-01-09" }]);
  });

  it("adds AniList's announcements once, even when MyAnimeList lists the same show", async () => {
    const c = cat(jikan([rec(1, { title_english: "Fresh 5" })]), [], al([rec2(5), rec2(6)]));
    const list = await c.upcoming("anime", TODAY, 20);
    expect(list.map((r) => r.title.id)).toEqual(["anime-al-5", "anime-al-6"]);
  });

  it("this week's top anime is TMDB's trending plus the airing ones, without repeats", async () => {
    const c = cat(jikan([]), [], al([rec2(7, { status: "RELEASING" })]));
    expect((await c.trending(10)).map((t) => t.id)).toEqual(["anime-al-7"]);
  });

  it("returns an AniList title and the wait for it", async () => {
    const c = cat(jikan([]), [], al([], rec2(8)));
    expect((await c.getTitle("anime-al-8"))?.title).toBe("Fresh 8");
    expect(await c.nextSeasons([{ id: "anime-al-8" } as Title], TODAY)).toMatchObject([{ date: "2027-01-09", season: 1 }]);
  });

  it("tells when the next episode of an anime airing weekly comes out", async () => {
    const airing = rec2(9, { status: "RELEASING", title: { english: "Black Clover", romaji: "Black Clover" }, nextAiringEpisode: { airingAt: Date.parse("2026-10-14T17:00:00Z") / 1000, episode: 5 } });
    const c = cat(jikan([]), [], al([airing]));
    const [r] = await c.nextSeasons([{ id: "tmdb-tv-1", type: "anime", title: "Black Clover", seasons: [] } as unknown as Title], TODAY);
    expect(r).toMatchObject({ date: "2026-10-14", episode: 5, season: null });
  });

  it("ignores a series of the same name that is not the one airing", async () => {
    const c = cat(jikan([]), [], al([rec2(10, { status: "RELEASING", title: { english: "Other Show" }, nextAiringEpisode: { airingAt: 1_800_000_000, episode: 2 } })]));
    expect(await c.nextSeasons([{ id: "tmdb-tv-1", type: "anime", title: "Black Clover", seasons: [] } as unknown as Title], TODAY)).toEqual([]);
  });

  it("a new season of a known show is a card of the show itself, marked with the season", async () => {
    const first = rec2(20, { status: "FINISHED", title: { english: "Big Show" }, startDate: { year: 2020, month: 1, day: 1 } });
    const second = rec2(21, { title: { english: "Big Show 2" }, relations: { edges: [{ relationType: "PREQUEL", node: { id: 20, format: "TV" } }] } });
    const client = new AniListClient((async (_url: string, init?: RequestInit) => {
      const q = String(JSON.parse(String(init?.body)).query);
      return new Response(JSON.stringify({ data: q.includes("Media(") ? { Media: first } : { Page: { media: [second] } } }), { status: 200 });
    }) as unknown as typeof fetch);
    const [r] = await cat(jikan([]), [], client).upcoming("anime", TODAY, 20);
    expect(r).toMatchObject({ date: "2027-01-09", season: 2, venue: "seasonal" });
    expect(r!.title).toMatchObject({ id: "anime-al-20", title: "Big Show" });
  });
});
