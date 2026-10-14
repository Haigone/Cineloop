import type { FilmCollection, MediaType, Release, Title } from "@/domain/types";
import { firstFor, isReplaced, replacementOf, withFirst, withoutReplaced } from "@/domain/duplicates";
import type { CastMember, CatalogService, DiscoverPage, DiscoverQuery, EpisodeInfo, NamePreference, PersonDetails, PersonHit } from "./types";

const releases = (list: readonly Release[]) => list.filter((r) => !isReplaced(r.title.id));

/**
 * The catalogue without the entries that repeat another title (src/domain/duplicates.ts): they are
 * left out of every answer, and asking for one by id answers with the title kept in its place.
 */
export class WithoutDuplicates implements CatalogService {
  readonly name: string;
  readonly complete: boolean;

  constructor(private base: CatalogService) {
    this.name = base.name;
    this.complete = base.complete;
  }

  private async kept(t: Title | null): Promise<Title | null> {
    const id = t && replacementOf(t.id);
    return id ? this.base.getTitle(id) : t;
  }

  async search(query: string, limit: number): Promise<Title[]> {
    const found = withoutReplaced(await this.base.search(query, limit));
    // A title this search should open with comes first, looked up when the source did not list it.
    const missing = firstFor(query).filter((id) => !found.some((t) => t.id === id));
    const extra = await Promise.all(missing.map((id) => this.base.getTitle(id).catch(() => null)));
    return withFirst(query, [...extra.filter((t): t is Title => t !== null), ...found]).slice(0, limit);
  }
  async getTitle(id: string): Promise<Title | null> {
    return this.base.getTitle(replacementOf(id) ?? id);
  }
  async trending(limit: number): Promise<Title[]> {
    return withoutReplaced(await this.base.trending(limit));
  }
  async discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage> {
    const page = await this.base.discover(query, limit);
    return { ...page, titles: withoutReplaced(page.titles) };
  }
  async similarTo(seeds: readonly Title[], limit: number): Promise<Title[]> {
    return withoutReplaced(await this.base.similarTo(seeds, limit));
  }
  async match(title: Title): Promise<Title | null> {
    return this.kept(await this.base.match(title));
  }
  async findByName(name: string, prefer: NamePreference): Promise<Title | null> {
    return this.kept(await this.base.findByName(name, prefer));
  }
  async nextSeasons(series: readonly Title[], today: string): Promise<Release[]> {
    return releases(await this.base.nextSeasons(series, today));
  }
  async related(title: Title, limit: number): Promise<Title[]> {
    return withoutReplaced(await this.base.related(title, limit));
  }
  episodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
    return this.base.episodes(replacementOf(id) ?? id, season);
  }
  async searchPeople(query: string, limit: number): Promise<PersonHit[]> {
    return (await this.base.searchPeople(query, limit)).map((p) => ({ ...p, knownFor: withoutReplaced(p.knownFor) }));
  }
  cast(title: Title, limit: number): Promise<CastMember[]> {
    return this.base.cast(title, limit);
  }
  async person(id: string): Promise<PersonDetails | null> {
    const p = await this.base.person(id);
    return p && { ...p, credits: p.credits.filter((c) => !isReplaced(c.title.id)) };
  }
  async upcoming(type: MediaType | "all", today: string, limit: number): Promise<Release[]> {
    return releases(await this.base.upcoming(type, today, limit));
  }
  async premieres(titles: readonly Title[], today: string): Promise<Release[]> {
    return releases(await this.base.premieres(titles, today));
  }
  collection(id: string): Promise<FilmCollection | null> {
    return this.base.collection(id);
  }
}
