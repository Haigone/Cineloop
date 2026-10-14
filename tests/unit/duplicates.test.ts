import { afterEach, describe, expect, it, vi } from "vitest";
import { firstFor, replacementOf, withFirst } from "@/domain/duplicates";
import { WithoutDuplicates } from "@/integrations/catalog/without-duplicates";
import { AnimeFirstCatalog } from "@/integrations/anime/anime-catalog";
import { AnnClient } from "@/integrations/anime/ann";
import { FillerList } from "@/integrations/anime/filler-list";
import { JikanClient } from "@/integrations/anime/jikan";
import { AniListClient } from "@/integrations/anime/anilist";
import type { Series, Title } from "@/domain/types";
import type { CatalogService } from "@/integrations/catalog/types";

afterEach(() => vi.restoreAllMocks());

const art = { posterUrl: "/p.jpg", backdropUrl: null, palette: ["#000", "#111", "#222"] as const };
const anime = (id: string, title: string, year = 2012): Series => ({ id, type: "anime", title, year, genres: ["Animazione"], overview: "", communityRating: null, artwork: art, providers: [], seasons: [], episodeRuntimeMinutes: 24 });
const jojo = anime("tmdb-tv-45790", "Le bizzarre avventure di JoJo");
const split = anime("tmdb-tv-60862", "Le bizzarre avventure di JoJo: Stardust Crusaders", 2014);
const annCard = anime("anime-ann-14445", "JoJo's Bizarre Adventure");
const rabbit: Title = { id: "tmdb-movie-515001", type: "movie", title: "Jojo Rabbit", year: 2019, genres: ["Commedia"], overview: "", communityRating: null, artwork: art, providers: [], runtimeMinutes: 108 };

const base = (results: Title[], byId: Record<string, Title> = {}): CatalogService =>
  ({
    name: "tmdb", complete: true,
    search: vi.fn(async () => results), getTitle: vi.fn(async (id: string) => byId[id] ?? null), trending: vi.fn(async () => results), discover: vi.fn(async () => ({ titles: results, hasMore: false })),
    similarTo: vi.fn(async () => results), match: vi.fn(async () => null), findByName: vi.fn(async () => split), nextSeasons: vi.fn(async () => []),
    related: vi.fn(async () => []), episodes: vi.fn(async () => null), upcoming: vi.fn(async () => []), premieres: vi.fn(async () => []),
    searchPeople: vi.fn(async () => []), person: vi.fn(async () => null), cast: vi.fn(async () => []), collection: vi.fn(async () => null),
  }) as CatalogService;

describe("duplicate titles", () => {
  it("knows which title replaces each duplicate and which searches open with it", () => {
    expect(replacementOf("tmdb-tv-60862")).toBe("tmdb-tv-45790");
    expect(replacementOf("anime-ann-14445")).toBe("tmdb-tv-45790");
    expect(replacementOf("tmdb-tv-45790")).toBeNull();
    expect(firstFor("JoJo")).toEqual(["tmdb-tv-45790"]);
    expect(firstFor("jo")).toEqual([]);
    expect(firstFor("jojo rabbit")).toEqual([]);
    expect(withFirst("jojo", [rabbit, jojo]).map((t) => t.id)).toEqual(["tmdb-tv-45790", "tmdb-movie-515001"]);
  });

  it("never come out of the catalogue, and their id opens the kept title", async () => {
    const inner = base([rabbit, split, annCard], { "tmdb-tv-45790": jojo });
    const cat = new WithoutDuplicates(inner);
    // Not listed by the source: looked up, and first.
    expect((await cat.search("jojo", 6)).map((t) => t.id)).toEqual(["tmdb-tv-45790", "tmdb-movie-515001"]);
    expect((await cat.trending(6)).map((t) => t.id)).toEqual(["tmdb-movie-515001"]);
    expect((await cat.discover({ type: "all", genre: null, sort: "popular" }, 6)).titles.map((t) => t.id)).toEqual(["tmdb-movie-515001"]);
    expect((await cat.getTitle("tmdb-tv-60862"))?.id).toBe("tmdb-tv-45790");
    expect((await cat.findByName("JoJo", { series: true, provider: "netflix" }))?.id).toBe("tmdb-tv-45790");
    // Another search keeps the source's order.
    expect((await cat.search("rabbit", 6)).map((t) => t.id)).toEqual(["tmdb-movie-515001"]);
  });
});

describe("the anime sources and a kept title", () => {
  const ANN = `<?xml version="1.0"?><ann><anime id="14445" gid="1" type="TV" name="JoJo's Bizarre Adventure">
    <info type="Main title" lang="EN">JoJo's Bizarre Adventure</info><info type="Number of episodes">26</info><info type="Vintage">2012-10-06</info>
  </anime></ann>`;

  it("shows the catalogue's JoJo, not the franchise card that repeats it", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("animenewsnetwork") ? new Response(ANN, { status: 200 }) : new Response("", { status: 404 }))) as unknown as typeof fetch;
    const ann = new AnnClient(fetcher);
    (ann as unknown as { last: number }).last = Number.NEGATIVE_INFINITY;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
    const none = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
    const cat = new WithoutDuplicates(new AnimeFirstCatalog(base([split, jojo, rabbit]), ann, new FillerList(fetcher), new JikanClient(none), new AniListClient(none)));
    expect((await cat.search("jojo", 6)).map((t) => t.id)).toEqual(["tmdb-tv-45790", "tmdb-movie-515001"]);
  });
});
