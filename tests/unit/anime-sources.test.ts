import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimeFirstCatalog } from "@/integrations/anime/anime-catalog";
import { JikanClient } from "@/integrations/anime/jikan";
import { AniListClient } from "@/integrations/anime/anilist";
import { AnnClient, parseAnimeList } from "@/integrations/anime/ann";
import { FillerList, fillerSlug, parseEpisodeKinds, parseFillerEpisodes, quickListOf, toRanges } from "@/integrations/anime/filler-list";
import { finishesEarlierSeason, finishesTitle, newSeasons } from "@/domain/library";
import { includedByDefault, isIncluded, plannedSeasons } from "@/domain/watch-order";
import { getRepository } from "@/server/data";
import { parseXml } from "@/lib/xml";
import type { Series, Title, WatchPart } from "@/domain/types";
import type { CatalogService } from "@/integrations/catalog/types";

afterEach(() => vi.restoreAllMocks());

// Fixtures follow the Encyclopedia API's documented shape (an <ann> root with <anime> entries,
// <info> lines and related-prev/related-next links); they are not captured from the live service.
const entry = (id: number, type: string, name: string, extra: string) =>
  `<anime id="${id}" gid="1" type="${type}" name="${name}">
    <info type="Main title" lang="EN">${name}</info>
    <info type="Plot Summary">A story &amp; more.</info>
    ${extra}
  </anime>`;
const BLEACH = entry(4658, "TV", "Bleach", `<info type="Number of episodes">366</info><info type="Vintage">2004-10-05 to 2012-03-27</info><info type="Genres">action</info><related-next rel="sequel" id="30001"/><related-next rel="side story" id="30002"/><related-next rel="adapted from" id="9999"/>`);
const TYBW = entry(30001, "TV", "Bleach: Thousand-Year Blood War", `<info type="Number of episodes">13</info><info type="Vintage">2022-10-10</info><related-prev rel="prequel" id="4658"/>`);
const MEMORIES = entry(30002, "movie", "Bleach: Memories of Nobody", `<info type="Number of episodes">1</info><info type="Vintage">2006-12-16</info><related-prev rel="side story" id="4658"/>`);
const ANN_ALL = `<?xml version="1.0"?><ann>${BLEACH}${TYBW}${MEMORIES}</ann>`;

const AFL = `<table><tr class="odd filler"><td class="Number">64</td><td class="Title">x</td><td class="Type">Filler</td></tr>
<tr class="even"><td class="Number">65</td><td class="Title">y</td><td class="Type">Mixed Canon/Filler</td></tr>
<tr class="odd"><td class="Number">66</td><td class="Title">z</td><td class="Type">Manga Canon</td></tr>
<tr class="even filler"><td class="Number">366</td><td class="Title">w</td><td class="Type">Filler</td></tr></table>`;

function routed(options: { ann?: string; afl?: string } = {}) {
  const urls: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    urls.push(url);
    if (url.includes("animenewsnetwork")) return new Response(options.ann ?? ANN_ALL, { status: 200 });
    if (url.includes("animefillerlist")) return url.endsWith("/bleach") ? new Response(options.afl ?? AFL, { status: 200 }) : new Response("", { status: 404 });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return { urls, fetcher };
}

const tmdbBleach: Title = {
  id: "tmdb-tv-30984", type: "anime", title: "Bleach", year: 2004, genres: ["Animazione"], overview: "", communityRating: null,
  artwork: { posterUrl: null, backdropUrl: null, palette: ["#000", "#111", "#222"] }, providers: [], seasons: [{ number: 1, episodeCount: 366 }], episodeRuntimeMinutes: 24,
};
const tmdbFilm: Title = { id: "tmdb-movie-1", type: "movie", title: "Bleach: Memories of Nobody", year: 2006, genres: ["Animazione"], overview: "", communityRating: null, artwork: tmdbBleach.artwork, providers: [], runtimeMinutes: 90, partOf: "tmdb-tv-30984" };
const base = (results: Title[]): CatalogService =>
  ({
    name: "tmdb", complete: true,
    search: vi.fn(async () => results), getTitle: vi.fn(async () => null), trending: vi.fn(async () => []), discover: vi.fn(async () => ({ titles: [], hasMore: false })),
    similarTo: vi.fn(async () => []), match: vi.fn(async () => null), findByName: vi.fn(async () => null), nextSeasons: vi.fn(async () => []),
    related: vi.fn(async () => []), episodes: vi.fn(async () => null), upcoming: vi.fn(async () => []),
  }) as CatalogService;

function catalog(results: Title[], options: Parameters<typeof routed>[0] = {}) {
  const { fetcher, urls } = routed(options);
  const ann = new AnnClient(fetcher);
  // Tests must not wait a second between calls.
  (ann as unknown as { last: number }).last = Number.NEGATIVE_INFINITY;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
  return { cat: new AnimeFirstCatalog(base(results), ann, new FillerList(fetcher), new JikanClient((async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch), new AniListClient((async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch)), urls };
}

describe("reading the sources", () => {
  it("parses the XML feed: entries, dates, relations", () => {
    const [bleach] = parseAnimeList(ANN_ALL);
    expect(bleach).toMatchObject({ id: "4658", type: "TV", name: "Bleach", episodes: 366, start: "2004-10-05", genres: ["action"], plot: "A story & more." });
    expect(bleach!.related).toEqual([{ id: "30001", rel: "sequel" }, { id: "30002", rel: "side story" }, { id: "9999", rel: "adapted from" }]);
    expect(parseXml("<a><b x='1'/><c>t</c></a>")?.children.map((c) => c.name)).toEqual(["b", "c"]);
  });

  it("reads filler episodes from a show page, keeping mixed ones", () => {
    expect(parseFillerEpisodes(AFL)).toEqual([64, 366]);
    expect(fillerSlug("Bleach: Thousand-Year Blood War")).toBe("bleach-thousand-year-blood-war");
    expect(fillerSlug("JoJo's Bizarre Adventure")).toBe("jojos-bizarre-adventure");
  });
});

describe("ANN's own wording of relations (Bleach as it answers today)", () => {
  const e = (id: number, type: string, name: string, start: string, eps: number | null, rel: [string, number][]) =>
    entry(id, type, name, `${eps ? `<info type="Number of episodes">${eps}</info>` : ""}<info type="Vintage">${start}</info>${rel.map(([r, i]) => `<related-next rel="${r}" id="${i}"/>`).join("")}`);
  const ann = `<ann>${[
    e(4240, "TV", "Bleach", "2004-10-05", 366, [["adapted from", 2468], ["related", 5440], ["side story", 6197], ["side story", 6600], ["sequel", 25066]]),
    e(25066, "TV", "Bleach: Thousand-Year Blood War", "2022-10-10", 13, [["sequel of", 4240], ["sequel", 26771]]),
    e(26771, "TV", "Bleach: Thousand-Year Blood War - The Separation", "2023-07-08", 13, [["sequel of", 25066]]),
    e(6600, "movie", "Bleach the Movie: Memories of Nobody", "2006-12-16", null, [["side story of", 4240], ["sequel", 8369]]),
    e(8369, "movie", "Bleach: The DiamondDust Rebellion", "2007-12-22", null, [["sequel of", 6600]]),
    e(6197, "OAV", "Bleach: The Sealed Sword Frenzy", "2005", 1, [["side story of", 4240]]),
    e(5440, "OAV", "Bleach: Memories in the Rain", "2004", 1, [["related to", 4240]]),
  ].join("")}</ann>`;

  it("gathers series, films and side stories, from the oldest entry or the newest, and leaves loose links out", async () => {
    for (const id of ["4240", "26771"]) {
      const { cat } = catalog([], { ann });
      const title = (await cat.getTitle(`anime-ann-${id}`)) as Series;
      expect(title.id).toBe("anime-ann-4240");
      expect(title.seasons.map((x) => x.episodeCount)).toEqual([366, 13, 13]);
      expect(title.watchOrder!.map((p) => p.key)).toEqual(["ann-4240", "ann-6197", "ann-6600", "ann-8369", "ann-25066", "ann-26771"]);
    }
  });
});

describe("links recorded on one side only", () => {
  // As on ANN in practice: the sequel names its prequel, the prequel names no sequel.
  const OLD = entry(4658, "TV", "Bleach", `<info type="Number of episodes">366</info><info type="Vintage">2004-10-05</info><related-next rel="adapted from" id="4199"/>`);
  const NEW = entry(25066, "TV", "Bleach: Thousand-Year Blood War", `<info type="Number of episodes">13</info><info type="Vintage">2022-10-10</info><related-prev rel="prequel" id="4658"/>`);
  const NEXT = entry(26771, "TV", "Bleach: Thousand-Year Blood War - The Separation", `<info type="Number of episodes">13</info><info type="Vintage">2023-07-08</info><related-prev rel="prequel" id="25066"/>`);
  const ann = `<ann>${OLD}${NEW}${NEXT}</ann>`;

  it("still gathers the whole franchise, whether it is opened or searched", async () => {
    const { cat } = catalog([tmdbBleach], { ann });
    const title = (await cat.getTitle("anime-ann-4658")) as Series;
    expect(title.seasons.map((x) => x.episodeCount)).toEqual([366, 13, 13]);
    const found = await cat.search("bleach", 5);
    expect(found.map((t) => t.id)).toEqual(["anime-ann-4658"]);
    expect((found[0] as Series).seasons).toHaveLength(3);
  });

  it("reads filler rows whose Type is wrapped in markup or only given by the row class", () => {
    const html = `<tr class="odd filler"><td class="Number"> 70 </td><td class="Type"><span>Filler</span></td></tr>
      <tr class="even mixed_canon/filler"><td class="Number">71</td><td class="Type">Mixed Canon/Filler</td></tr>
      <tr class="odd"><td class="Number">72</td><td class="Type"><b>Filler</b></td></tr>
      <tr class="even manga_canon"><td class="Number">73</td><td class="Type">Manga Canon</td></tr>`;
    expect(parseFillerEpisodes(html)).toEqual([70, 72]);
  });
});

describe("anime come from the anime sources first", () => {
  it("gathers a franchise into one title with its watching order", async () => {
    const { cat } = catalog([tmdbBleach, tmdbFilm]);
    const found = await cat.search("bleach", 10);
    // One result: the series and its film are folded into it, TMDB's copies are gone.
    expect(found.map((t) => t.id)).toEqual(["anime-ann-4658"]);
    const bleach = found[0] as Series;
    expect(bleach.seasons.map((s) => [s.number, s.episodeCount, s.name])).toEqual([[1, 366, undefined], [2, 13, "Bleach: Thousand-Year Blood War"]]);
    expect(bleach.watchOrder!.map((p) => [p.kind, p.name])).toEqual([
      ["season", "Bleach"],
      ["movie", "Bleach: Memories of Nobody"],
      ["season", "Bleach: Thousand-Year Blood War"],
    ]);
    // The manga adaptation link is not a franchise entry.
    expect(bleach.watchOrder!.some((p) => p.key === "ann-9999")).toBe(false);
    expect(bleach.watchOrder![0]!.filler).toEqual([64, 366]);
  });

  it("drops the catalogue's copies of the franchise's films, but not live action or other films of the same name", async () => {
    const film = (id: string, title: string, year: number): Title => ({ ...tmdbFilm, id, title, year, partOf: undefined });
    const { cat } = catalog([
      tmdbBleach,
      film("tmdb-movie-10", "Bleach - Memories of Nobody (Il film)", 2006),
      film("tmdb-movie-11", "Bleach", 2018),
      film("tmdb-movie-12", "Bleach: Memories of Nobody", 2019),
    ]);
    expect((await cat.search("bleach", 10)).map((t) => t.id)).toEqual(["anime-ann-4658", "tmdb-movie-11", "tmdb-movie-12"]);
  });

  it("falls back to TMDB when the anime sources have nothing", async () => {
    const { cat } = catalog([tmdbBleach, tmdbFilm], { ann: "<ann></ann>" });
    expect((await cat.search("bleach", 10)).map((t) => t.id)).toEqual(["tmdb-tv-30984", "tmdb-movie-1"]);
  });

  it("leaves non-anime searches alone, without asking the anime sources", async () => {
    const show: Title = { ...tmdbBleach, id: "tmdb-tv-1", type: "series", title: "Dark" };
    const { cat, urls } = catalog([show]);
    expect((await cat.search("dark", 10)).map((t) => t.id)).toEqual(["tmdb-tv-1"]);
    expect(urls).toEqual([]);
  });

  it("opens a franchise by id, lists a season's episodes and knows a season still to come", async () => {
    const { cat } = catalog([]);
    const title = (await cat.getTitle("anime-ann-4658")) as Series;
    expect(title.title).toBe("Bleach");
    expect((await cat.episodes("anime-ann-4658", 2))!.length).toBe(13);
    expect(title.seasons[1]!.airDate).toBe("2022-10-10");
  });
});

describe("choosing what to watch", () => {
  const parts: WatchPart[] = [
    { key: "ann-1", kind: "season", name: "A", year: 2000, episodes: 100, canon: null, season: 1, filler: [99, 100] },
    { key: "ann-2", kind: "movie", name: "Recap", year: 2001, episodes: 1, canon: false },
    { key: "ann-3", kind: "ova", name: "OVA", year: 2002, episodes: 2, canon: null },
    { key: "ann-4", kind: "season", name: "B", year: 2003, episodes: 12, canon: null, season: 2 },
  ];
  const title: Series = { ...(tmdbBleach as Series), seasons: [{ number: 1, episodeCount: 100 }, { number: 2, episodeCount: 12 }], watchOrder: [...parts] };

  it("leaves out what is known not to be canon, OVAs and specials, until the user says otherwise", () => {
    expect(parts.map(includedByDefault)).toEqual([true, false, false, true]);
    expect(isIncluded(parts[1]!, { "ann-2": true })).toBe(true);
    expect(isIncluded(parts[3]!, { "ann-4": false })).toBe(false);
  });

  it("finishes at the last season that is wanted, and not on trailing filler", () => {
    const today = "2026-01-01";
    // Season 2 left out: finishing season 1 (up to its last real episode, 98) finishes the title.
    const without = { "ann-4": false };
    expect(plannedSeasons(title, without).map((s) => s.number)).toEqual([1]);
    expect(finishesTitle(title, { season: 1, episode: 98, fraction: 0.95 }, today, without)).toBe(true);
    expect(finishesTitle(title, { season: 1, episode: 97, fraction: 0.95 }, today, without)).toBe(false);
    // Watching the filler too: the real last episode is 100.
    expect(finishesTitle(title, { season: 1, episode: 98, fraction: 0.95 }, today, { "ann-4": false, filler: true })).toBe(false);
    // With everything on, only the last season's last episode finishes it.
    expect(finishesTitle(title, { season: 2, episode: 12, fraction: 0.95 }, today)).toBe(true);
    expect(finishesTitle(title, { season: 1, episode: 98, fraction: 0.95 }, today)).toBe(false);
  });

  it("does not call an excluded season a novelty", () => {
    const entry = { userId: "u", titleId: title.id, status: "completed" as const, addedAt: "", lastWatchedAt: null, rating: null, progress: null, seenThrough: 1 };
    expect(newSeasons(entry, title, "2026-01-01").map((s) => s.number)).toEqual([2]);
    expect(newSeasons({ ...entry, partOverrides: { "ann-4": false } }, title, "2026-01-01")).toEqual([]);
  });

  it("saves a choice on the library entry, and takes it back", async () => {
    const repo = getRepository();
    await repo.upsertTitles([title]);
    await repo.setLibraryStatus("u_marco", title.id, "watching");
    await repo.setPartOverride("u_marco", title.id, "ann-4", false);
    const read = async () => (await repo.listLibrary("u_marco")).find((e) => e.titleId === title.id)?.partOverrides;
    expect(await read()).toEqual({ "ann-4": false });
    await repo.setPartOverride("u_marco", title.id, "ann-4", null);
    expect(await read()).toEqual({});
  });
});

describe("filler quick list and artwork", () => {
  const PAGE = `<table>${["manga_canon:Manga Canon", "manga_canon:Manga Canon", "anime_canon:Anime Canon", "filler:Filler", "filler:Filler", "mixed_canon/filler:Mixed Canon/Filler", "manga_canon:Manga Canon"]
    .map((r, i) => `<tr class="${r.split(":")[0]} odd"><td class="Number">${i + 1}</td><td class="Type"><span>${r.split(":")[1]}</span></td></tr>`)
    .join("")}</table>`;

  it("groups the episodes of each kind into ranges", () => {
    expect(toRanges([1, 2, 3, 5, 7, 8])).toEqual([[1, 3], [5, 5], [7, 8]]);
    expect(quickListOf(parseEpisodeKinds(PAGE))).toEqual({ mangaCanon: [[1, 2], [7, 7]], animeCanon: [[3, 3]], mixed: [[6, 6]], filler: [[4, 5]] });
    expect(quickListOf(parseEpisodeKinds(PAGE), 4).filler).toEqual([[4, 4]]);
  });

  it("borrows TMDB's poster for a franchise it knows, else MyAnimeList's", async () => {
    const withPoster = { ...tmdbBleach, artwork: { ...tmdbBleach.artwork, posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg", backdropUrl: "https://image.tmdb.org/t/p/w1280/y.jpg" } } as Title;
    const first = catalog([withPoster]);
    const [a] = await first.cat.search("bleach", 5);
    expect(a!.artwork.posterUrl).toBe("https://image.tmdb.org/t/p/w500/x.jpg");

    const { fetcher } = routed();
    const ann = new AnnClient(fetcher);
    (ann as unknown as { last: number }).last = Number.NEGATIVE_INFINITY;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
    const mal = new JikanClient((async () => new Response(JSON.stringify({ data: [{ mal_id: 269, title: "Bleach", type: "TV", images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/3/40451l.jpg" } } }] }), { status: 200 })) as unknown as typeof fetch);
    const cat = new AnimeFirstCatalog(base([tmdbBleach]), ann, new FillerList(fetcher), mal, new AniListClient((async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch));
    const [b] = await cat.search("bleach", 5);
    expect(b!.artwork.posterUrl).toBe("https://cdn.myanimelist.net/images/anime/3/40451l.jpg");
  });

  it("replaces a TMDB anime by the franchise, keeping the user's own entry when both exist", async () => {
    const repo = getRepository();
    const old = { ...tmdbBleach, id: "tmdb-tv-777" } as Title;
    const next = { ...tmdbBleach, id: "anime-ann-777" } as Title;
    await repo.upsertTitles([old]);
    await repo.setLibraryStatus("u_marco", old.id, "watching");
    const res = await repo.replaceTitle(old.id, next);
    expect(res).toEqual({ moved: 1, merged: 0 });
    const library = await repo.listLibrary("u_marco");
    expect(library.some((e) => e.titleId === old.id)).toBe(false);
    expect(library.find((e) => e.titleId === next.id)?.status).toBe("watching");
    expect(await repo.getTitlesByIds([old.id])).toEqual([]);
  });
});

describe("a season seen while a later one is out", () => {
  const show = { ...tmdbBleach, seasons: [{ number: 1, episodeCount: 12, airDate: "2020-01-01" }, { number: 2, episodeCount: 12, airDate: "2021-01-01" }] } as Series;
  it("is the end of an earlier season, not of the title", () => {
    expect(finishesEarlierSeason(show, { season: 1, episode: 12, fraction: 1 }, "2026-01-01")).toBe(true);
    expect(finishesEarlierSeason(show, { season: 1, episode: 11, fraction: 1 }, "2026-01-01")).toBe(false);
    expect(finishesEarlierSeason(show, { season: 2, episode: 12, fraction: 1 }, "2026-01-01")).toBe(false);
    // The next season has not aired yet: it is the last one out, so the title is finished instead.
    expect(finishesEarlierSeason(show, { season: 1, episode: 12, fraction: 1 }, "2020-06-01")).toBe(false);
  });
});
