import type { FilmCollection, MediaType, Movie, Release, Title } from "@/domain/types";
import { addDays, italianDay } from "@/lib/dates";
import { searchKey } from "@/lib/text";
import { DUNE_SAGA, SEED_TITLES } from "@/server/data/seed/catalog";
import type { CatalogService, DiscoverPage, DiscoverQuery, EpisodeInfo, NamePreference, CastMember, PersonDetails, PersonHit } from "./types";
import { franchiseKey } from "@/domain/franchise";

/**
 * Example announcements so the demo can show "new season" rows. The dates are
 * relative to today and made up; with TMDB the real ones are used.
 */
const DEMO_NEXT_SEASONS: Record<string, { season: number; inDays: number | null }> = {
  "the-boys": { season: 5, inDays: 12 },
  frieren: { season: 2, inDays: 4 },
  "the-last-of-us": { season: 3, inDays: 210 },
  severance: { season: 3, inDays: null },
};

/** The demo saga's third film: not out yet, its date (made up) moves with today. */
const DUNE_THREE_IN_DAYS = 65;

function duneThree(today: string): Movie {
  const date = addDays(today, DUNE_THREE_IN_DAYS);
  return {
    id: "dune-part-three",
    type: "movie",
    title: "Dune - Parte tre",
    year: Number(date.slice(0, 4)),
    runtimeMinutes: 0,
    genres: ["Fantascienza", "Avventura", "Dramma"],
    providers: [],
    communityRating: null,
    overview: "Anni dopo la guerra santa, l'imperatore Paul Atreides deve fare i conti con il prezzo del potere che ha preso.",
    artwork: { posterUrl: null, backdropUrl: null, palette: ["#8a5a2b", "#120904", "#e0b878"] },
    collection: DUNE_SAGA,
  };
}

/**
 * The bundled demo catalog: a few dozen titles, no keys, works offline.
 * It answers the same questions as TMDB so Esplora behaves identically;
 * `complete` is false so the UI can say the catalog is only a sample.
 */
export class SeedCatalog implements CatalogService {
  readonly name = "demo";
  readonly complete = false;
  private titles = new Map(SEED_TITLES.map((t) => [t.id, t]));

  async search(query: string, limit: number): Promise<Title[]> {
    const q = searchKey(query);
    if (!q) return [];
    return [...this.titles.values()].filter((t) => searchKey(t.title).includes(q)).slice(0, limit);
  }

  /** The demo titles carry no cast. */
  async searchPeople(_query: string, _limit: number): Promise<PersonHit[]> {
    return [];
  }

  async person(_id: string): Promise<PersonDetails | null> {
    return null;
  }

  async cast(_title: Title, _limit: number): Promise<CastMember[]> {
    return [];
  }

  async getTitle(id: string): Promise<Title | null> {
    if (id === "dune-part-three") return duneThree(italianDay());
    return this.titles.get(id) ?? null;
  }

  async collection(id: string): Promise<FilmCollection | null> {
    if (id !== DUNE_SAGA.id) return null;
    const today = italianDay();
    const films = [...this.titles.values()].filter((t): t is Movie => t.type === "movie" && t.collection?.id === id);
    const third = duneThree(today);
    return {
      ...DUNE_SAGA,
      overview: "La saga di Paul Atreides su Arrakis.",
      artwork: films[0]?.artwork ?? third.artwork,
      parts: [
        ...films.map((title) => ({ title, releaseDate: `${title.year}-09-15` })).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)),
        { title: third, releaseDate: addDays(today, DUNE_THREE_IN_DAYS) },
      ],
    };
  }

  async related(title: Title, limit: number): Promise<Title[]> {
    const series = title.type === "movie" && title.partOf ? this.titles.get(title.partOf) : undefined;
    const key = franchiseKey(series?.title ?? title.title);
    return [...this.titles.values()]
      .filter((t) => t.id !== title.id && (t.type === "anime" || (t.type === "movie" && t.partOf)) && franchiseKey(t.title) === key)
      .slice(0, limit);
  }

  async episodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
    const title = this.titles.get(id);
    const count = title && title.type !== "movie" ? title.seasons.find((s) => s.number === season)?.episodeCount : undefined;
    if (!count) return null;
    return Array.from({ length: count }, (_, i) => ({ number: i + 1, name: null, airDate: null, runtimeMinutes: null }));
  }

  async trending(limit: number): Promise<Title[]> {
    return this.sorted("popular").slice(0, limit);
  }

  async discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage> {
    const page = Math.max(1, query.page ?? 1);
    const matching = this.sorted(query.sort).filter(
      (t) =>
        (query.type === "all" || t.type === query.type) &&
        (!query.genre || t.genres.includes(query.genre)) &&
        (!query.provider || t.providers.includes(query.provider)),
    );
    return { titles: matching.slice((page - 1) * limit, page * limit), hasMore: matching.length > page * limit };
  }

  async nextSeasons(series: readonly Title[], today: string): Promise<Release[]> {
    return series.flatMap((title) => {
      const next = DEMO_NEXT_SEASONS[title.id];
      if (!next || title.type === "movie") return [];
      return [{ title, season: next.season, date: next.inDays === null ? null : addDays(today, next.inDays) }];
    });
  }

  async upcoming(_type: MediaType | "all", _today: string, _limit: number): Promise<Release[]> {
    // Every bundled title is already out.
    return [];
  }

  async premieres(_titles: readonly Title[], _today: string): Promise<Release[]> {
    // Every bundled title is already out.
    return [];
  }

  async findByName(name: string, prefer: NamePreference): Promise<Title | null> {
    const key = searchKey(name);
    const hits = [...this.titles.values()].filter((t) => searchKey(t.title) === key && (!prefer.series || t.type !== "movie"));
    return hits.find((t) => t.providers.includes(prefer.provider)) ?? hits[0] ?? null;
  }

  async match(title: Title): Promise<Title | null> {
    return this.titles.get(title.id) ?? null;
  }

  async similarTo(seeds: readonly Title[], limit: number): Promise<Title[]> {
    if (seeds.length === 0) return [];
    const wanted = new Set(seeds.flatMap((t) => t.genres));
    const seedIdSet = new Set(seeds.map((t) => t.id));
    return [...this.titles.values()]
      .filter((t) => !seedIdSet.has(t.id))
      .map((t) => ({ t, overlap: t.genres.filter((g) => wanted.has(g)).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || (b.t.communityRating ?? 0) - (a.t.communityRating ?? 0))
      .slice(0, limit)
      .map((x) => x.t);
  }

  private sorted(sort: DiscoverQuery["sort"]): Title[] {
    const all = [...this.titles.values()];
    if (sort === "recent") return all.sort((a, b) => b.year - a.year);
    // The demo catalog has no popularity signal, so community rating stands in.
    return all.sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0));
  }
}
