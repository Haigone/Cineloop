import { describe, expect, it, vi } from "vitest";
import { TmdbCatalog } from "@/integrations/catalog/tmdb-catalog";
import { franchiseNames, withoutSeriesFilms } from "@/domain/franchise";
import { sectionOf, type Title } from "@/domain/types";

function tmdbWith(route: (url: string) => unknown) {
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(route(url)), { status: 200 }));
  return { fetcher, tmdb: new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch) };
}

const anime = { original_language: "ja", genre_ids: [16] };
const BLEACH = { id: 30984, media_type: "tv", name: "Bleach", original_name: "BLEACH", first_air_date: "2004-10-05", ...anime };
const TYBW = { id: 207468, media_type: "tv", name: "Bleach: Thousand-Year Blood War", original_name: "BLEACH 千年血戦篇", first_air_date: "2022-10-11", ...anime };
const MEMORIES = { id: 21708, media_type: "movie", title: "Bleach: Memories of Nobody", original_title: "劇場版 BLEACH MEMORIES OF NOBODY", release_date: "2006-12-16", ...anime };
const HELL = { id: 41557, media_type: "movie", title: "Bleach - Hell Verse", original_title: "劇場版 BLEACH 地獄篇", release_date: "2010-12-04", ...anime };
const LIVE = { id: 489936, media_type: "movie", title: "Bleach", original_title: "BLEACH", release_date: "2018-07-20", original_language: "ja", genre_ids: [28, 14] };
const SPIRITED = { id: 129, media_type: "movie", title: "La città incantata", original_title: "千と千尋の神隠し", release_date: "2001-07-20", ...anime };

function bleachRoutes(url: string) {
  if (url.includes("/search/tv")) return { results: url.includes("query=Bleach&") ? [BLEACH, TYBW] : [] };
  if (url.includes("/search/multi")) return { results: [BLEACH, MEMORIES, LIVE, HELL, TYBW, SPIRITED] };
  if (url.includes("/movie/21708?")) return { ...MEMORIES, genres: [{ id: 16 }], belongs_to_collection: { name: "Bleach - Collezione" } };
  if (url.includes("/movie/1669841?")) return { id: 1669841, media_type: "movie", title: "Bleach: Thousand-Year Blood War", original_title: "BLEACH 千年血戦篇", release_date: "2025-01-01", ...anime, genres: [{ id: 16 }], belongs_to_collection: null };
  if (url.includes("/movie/129?")) return { ...SPIRITED, genres: [{ id: 16 }], belongs_to_collection: null };
  if (url.includes("/tv/30984/season/1")) return { episodes: [{ episode_number: 1, name: "Il giorno in cui diventai uno Shinigami", air_date: "2004-10-05" }, { episode_number: 2, name: "Episodio 2" }] };
  return {};
}

describe("anime films and franchises", () => {
  it("reads a film's series from its name or saga", () => {
    expect(franchiseNames(["Demon Slayer - Il treno Mugen", "劇場版「鬼滅の刃」無限列車編"])).toContain("Demon Slayer");
    expect(franchiseNames(["Jujutsu Kaisen 0"], "Jujutsu Kaisen - Collezione")).toContain("Jujutsu Kaisen");
  });

  it("links the Bleach special TMDB movie id to the original Bleach series", async () => {
    const { tmdb } = tmdbWith(bleachRoutes);
    const film = await tmdb.getTitle("tmdb-movie-1669841");
    expect(film).toMatchObject({ type: "movie", partOf: "tmdb-tv-30984" });
    expect(sectionOf(film!)).toBe("anime");
  });

  it("links an anime film to its series and leaves a film of its own alone", async () => {
    const { tmdb } = tmdbWith(bleachRoutes);
    const film = await tmdb.getTitle("tmdb-movie-21708");
    expect(film).toMatchObject({ type: "movie", partOf: "tmdb-tv-30984" });
    expect(sectionOf(film!)).toBe("anime");
    const own = await tmdb.getTitle("tmdb-movie-129");
    expect(own).toMatchObject({ type: "movie", partOf: null });
    expect(sectionOf(own!)).toBe("movie");
  });

  it("searching Bleach gives the series and its final part, not every film", async () => {
    const { tmdb } = tmdbWith(bleachRoutes);
    const names = (await tmdb.search("bleach", 10)).map((t) => t.title);
    expect(names).toEqual(["Bleach", "Bleach", "Bleach: Thousand-Year Blood War", "La città incantata"]);
  });

  it("lists the other parts and films of a series", async () => {
    const { tmdb } = tmdbWith(bleachRoutes);
    const related = await tmdb.related({ id: "tmdb-tv-30984", type: "anime", title: "Bleach" } as Title, 10);
    expect(related.map((t) => t.title)).toEqual(["Bleach: Thousand-Year Blood War", "Bleach: Memories of Nobody", "Bleach - Hell Verse"]);
  });

  it("lists a season's episodes, without placeholder names", async () => {
    const { tmdb } = tmdbWith(bleachRoutes);
    expect(await tmdb.episodes("tmdb-tv-30984", 1)).toEqual([
      { number: 1, name: "Il giorno in cui diventai uno Shinigami", airDate: "2004-10-05", runtimeMinutes: null },
      { number: 2, name: null, airDate: null, runtimeMinutes: null },
    ]);
  });

  it("drops a series' film from results that already have the series", () => {
    const list = [
      { id: "s", type: "anime" },
      { id: "f", type: "movie", partOf: "s" },
      { id: "g", type: "movie", partOf: "other" },
    ];
    expect(withoutSeriesFilms(list).map((t) => t.id)).toEqual(["s", "g"]);
  });

  it("counts free and ad-supported offers as where to watch", async () => {
    const { tmdb } = tmdbWith((url) =>
      url.includes("/tv/1?") ? { id: 1, name: "X", ...anime, "watch/providers": { results: { IT: { ads: [{ provider_id: 283 }] } } } } : {},
    );
    expect((await tmdb.getTitle("tmdb-tv-1"))!.providers).toEqual(["crunchyroll"]);
  });
});
