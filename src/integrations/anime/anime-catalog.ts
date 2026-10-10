import type { MediaType, Release, Title } from "@/domain/types";
import type { CatalogService, DiscoverPage, DiscoverQuery, EpisodeInfo, NamePreference } from "@/integrations/catalog/types";
import { searchKey } from "@/lib/text";
import { AnnClient } from "./ann";
import { FillerList } from "./filler-list";
import { ANIME_ID, buildFranchise, collectEntries, kindOf, type Franchise } from "./franchise";
import type { AnimeEntry } from "./types";

/** A built franchise is reused for this long before the sources are asked again. */
const MEMO_MS = 6 * 3_600_000;
/** A search shows at most this many franchises, each one costing a few source requests. */
const MAX_FRANCHISES = 3;

const isAnimeish = (t: Title) => t.type === "anime";

const FILLER_WORDS = new Set(["the", "movie", "film", "il", "la", "lo", "di", "del", "of", "a", "an"]);
const words = (s: string) =>
  searchKey(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER_WORDS.has(w));

/** True when a film from the catalogue is one of the franchise's own films: same words, same year (give or take one). */
export function isPartOf(film: Title, franchise: Franchise): boolean {
  const a = words(film.title);
  if (a.length === 0) return false;
  return (franchise.title.watchOrder ?? []).some((p) => {
    if (p.kind === "season" || p.year === null || Math.abs(p.year - film.year) > 1) return false;
    const b = words(p.name);
    return a.every((w) => b.includes(w)) || b.every((w) => a.includes(w));
  });
}

/**
 * Anime come from Anime News Network (the franchise and its parts) and Anime
 * Filler List (filler episodes); TMDB, the catalogue underneath, answers only
 * when those have nothing. Everything else passes straight through.
 *
 * AniDB is not connected: its API cannot search by name and needs a
 * registered client, so there is nothing for it to answer here yet.
 */
export class AnimeFirstCatalog implements CatalogService {
  readonly name: string;
  readonly complete: boolean;
  private memo = new Map<string, { at: number; value: Promise<Franchise | null> }>();

  constructor(
    private base: CatalogService,
    private ann: AnnClient = new AnnClient(),
    private fillers: FillerList = new FillerList(),
  ) {
    this.name = `anime+${base.name}`;
    this.complete = base.complete;
  }

  /** The franchise that holds an entry, built once and kept for a few hours. */
  private franchise(annId: string, known: readonly AnimeEntry[] = []): Promise<Franchise | null> {
    const hit = this.memo.get(annId);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    const value = this.gather(annId, known)
      .then((entries) => buildFranchise(entries, this.fillers))
      .catch((err) => {
        console.error("building an anime franchise failed", err);
        return null;
      });
    this.memo.set(annId, { at: Date.now(), value });
    // A failure must not stick for hours.
    void value.then((f) => {
      if (!f) this.memo.delete(annId);
      else for (const id of f.entries.keys()) this.memo.set(id, { at: Date.now(), value });
    });
    return value;
  }

  /**
   * The franchise's entries. A sequel may link back to its prequel while the prequel does not link
   * forward, so entries that share the name are looked up too and linked from their side.
   */
  private async gather(annId: string, known: readonly AnimeEntry[]): Promise<Map<string, AnimeEntry>> {
    let have = [...known];
    if (have.length < 2) {
      const root = have.find((e) => e.id === annId) ?? (await this.ann.byIds([annId]))[0];
      if (!root) return new Map();
      have = [root, ...(await this.ann.search(root.name))];
    }
    return collectEntries([annId], this.ann, have);
  }

  async search(query: string, limit: number): Promise<Title[]> {
    const found = await this.base.search(query, limit);
    if (!found.some(isAnimeish)) return found;
    const entries = await this.ann.search(query);
    const key = searchKey(query);
    const rank = (e: AnimeEntry) => (searchKey(e.name) === key ? 0 : searchKey(e.name).startsWith(key) ? 1 : 2);
    const seeds = entries.filter((e) => kindOf(e) === "season").sort((a, b) => rank(a) - rank(b) || (a.start ?? "9999").localeCompare(b.start ?? "9999"));
    const franchises: Franchise[] = [];
    for (const seed of seeds) {
      if (franchises.length >= MAX_FRANCHISES) break;
      if (franchises.some((f) => f.entries.has(seed.id))) continue;
      const f = await this.franchise(seed.id, entries);
      if (f && !franchises.some((x) => x.title.id === f.title.id)) franchises.push(f);
    }
    if (franchises.length === 0) return found;
    // A franchise stands for its series and its films: TMDB's own anime results would repeat them.
    const rest = found.filter((t) => !isAnimeish(t) && !(t.type === "movie" && (t.partOf || franchises.some((f) => isPartOf(t, f)))));
    return [...franchises.map((f) => f.title), ...rest].slice(0, limit);
  }

  async getTitle(id: string): Promise<Title | null> {
    const m = ANIME_ID.exec(id);
    if (!m) return this.base.getTitle(id);
    return (await this.franchise(m[1]!))?.title ?? null;
  }

  async findByName(name: string, prefer: NamePreference): Promise<Title | null> {
    const hit = await this.base.findByName(name, prefer);
    // A film, or a series TMDB does not call anime, is not ours to look up.
    if (hit && !isAnimeish(hit)) return hit;
    const key = searchKey(name);
    const entries = await this.ann.search(name);
    const exact = entries.find((e) => searchKey(e.name) === key && kindOf(e) === "season");
    if (!exact) return hit;
    return (await this.franchise(exact.id, [exact]))?.title ?? hit;
  }

  async nextSeasons(series: readonly Title[], today: string): Promise<Release[]> {
    const ours = series.filter((t) => ANIME_ID.test(t.id));
    const rest = series.filter((t) => !ANIME_ID.test(t.id));
    const [base, own] = await Promise.all([
      this.base.nextSeasons(rest, today),
      Promise.all(
        ours.map(async (t): Promise<Release | null> => {
          const f = await this.franchise(ANIME_ID.exec(t.id)![1]!);
          const next = f?.title.seasons.find((s) => s.airDate && s.airDate > today);
          return f && next ? { title: f.title, date: next.airDate!, season: next.number } : null;
        }),
      ),
    ]);
    return [...base, ...own.filter((r): r is Release => r !== null)];
  }

  async related(title: Title, limit: number): Promise<Title[]> {
    // The parts of an anime franchise are in its own watching order, not separate titles.
    return ANIME_ID.test(title.id) ? [] : this.base.related(title, limit);
  }

  async episodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
    const m = ANIME_ID.exec(id);
    if (!m) return this.base.episodes(id, season);
    const f = await this.franchise(m[1]!);
    const part = f?.title.watchOrder?.find((p) => p.kind === "season" && p.season === season);
    const entry = part && f?.entries.get(part.key.slice(4));
    if (!entry) return null;
    const names = new Map(entry.episodeNames.map((e) => [e.number, e.name]));
    const air = entry.start && entry.start.length === 10 ? entry.start : null;
    return Array.from({ length: entry.episodes ?? names.size }, (_, i) => ({
      number: i + 1,
      name: names.get(i + 1) ?? null,
      airDate: i === 0 ? air : null,
      runtimeMinutes: entry.runtimeMinutes,
    }));
  }

  trending(limit: number): Promise<Title[]> {
    return this.base.trending(limit);
  }
  discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage> {
    return this.base.discover(query, limit);
  }
  similarTo(seeds: readonly Title[], limit: number): Promise<Title[]> {
    return this.base.similarTo(seeds, limit);
  }
  match(title: Title): Promise<Title | null> {
    return this.base.match(title);
  }
  upcoming(type: MediaType | "all", today: string, limit: number): Promise<Release[]> {
    return this.base.upcoming(type, today, limit);
  }
}

