import type { MediaType, Release, Title } from "@/domain/types";
import { addDays } from "@/lib/dates";
import { searchKey } from "@/lib/text";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import type { CatalogService, DiscoverPage, DiscoverQuery, NamePreference } from "./types";

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

  async getTitle(id: string): Promise<Title | null> {
    return this.titles.get(id) ?? null;
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
