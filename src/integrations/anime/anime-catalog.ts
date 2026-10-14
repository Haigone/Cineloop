import type { MediaType, Release, Title } from "@/domain/types";
import type { CatalogService, DiscoverPage, DiscoverQuery, EpisodeInfo, NamePreference, CastMember, PersonDetails, PersonHit } from "@/integrations/catalog/types";
import { addDays, italianDay } from "@/lib/dates";
import { searchKey } from "@/lib/text";
import { AnnClient } from "./ann";
import { FillerList } from "./filler-list";
import { AL_ID, AniListClient, type AniListAnime, alSeries, alDate, alNames } from "./anilist";
import { JikanClient, MAL_ID, airDate, namesOf, toSeries } from "./jikan";
import { ANIME_ID, buildFranchise, collectEntries, kindOf, runOffset, withinEntry, type Franchise } from "./franchise";
import type { AnimeEntry } from "./types";

/** A built franchise is reused for this long before the sources are asked again. */
const MEMO_MS = 6 * 3_600_000;
/** A search shows at most this many franchises, each one costing a few source requests. */
const MAX_FRANCHISES = 3;
/** New seasons whose main show is looked up per Esplora refresh (ANN allows a call a second). */
const MAX_MAIN_LOOKUPS = 10;
/** How long the page waits for the main shows of new seasons before showing AniList's own cards. */
const MAIN_LOOKUP_BUDGET_MS = 6000;

/**
 * The season an airing AniList series is: the one that began closest to its start (a run split into
 * several entries has later ones that have not begun), else the last season when it has no date.
 */
function airingSeason(f: Franchise, a: AniListAnime) {
  const seasons = f.title.seasons;
  // A long run split into several entries of one name (One Piece): AniList counts it as one show, so the airing
  // episodes belong to the latest entry that has begun, not to one still to come.
  const run = seasons.filter((s) => !s.name);
  if (run.length > 1) {
    const today = italianDay(new Date());
    return run.filter((s) => s.airDate && s.airDate <= today).at(-1) ?? run.at(-1);
  }
  const start = alDate(a);
  if (start) {
    const near = seasons
      .filter((s) => s.airDate)
      .map((s) => ({ s, gap: Math.abs(Date.parse(s.airDate!) - Date.parse(start)) }))
      .filter((x) => x.gap < 400 * 86_400_000)
      .sort((x, y) => x.gap - y.gap)[0];
    if (near) return near.s;
  }
  const last = seasons.at(-1);
  return last && (!start || !last.airDate) ? last : undefined;
}

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
    private jikan: JikanClient = new JikanClient(),
    private anilist: AniListClient = new AniListClient(),
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
      .then((f) => (f ? this.withArtwork(f) : f))
      .then((f) => (f ? this.withAiring(f) : f))
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
   * A picture for the franchise: TMDB's when it knows the show, else MyAnimeList's, else the one
   * Anime News Network lists (often missing).
   */
  private async withArtwork(f: Franchise): Promise<Franchise> {
    const name = f.title.title;
    const key = searchKey(name);
    const same = (n: string) => {
      const k = searchKey(n);
      return k === key || (k.length > 3 && key.length > 3 && (k.startsWith(key) || key.startsWith(k)));
    };
    const tmdb = await this.base.search(name, 5).then((r) => r.find((t) => t.type !== "movie" && same(t.title) && t.artwork.posterUrl), () => undefined);
    if (tmdb) {
      // TMDB's page is the fuller one: the franchise card keeps everything it has (rating, services, overview, genres).
      const full = (await this.base.getTitle(tmdb.id).catch(() => null)) ?? tmdb;
      const t = f.title;
      t.artwork = { ...t.artwork, posterUrl: tmdb.artwork.posterUrl, backdropUrl: full.artwork.backdropUrl ?? tmdb.artwork.backdropUrl ?? t.artwork.backdropUrl };
      if (full.overview) t.overview = full.overview;
      if (full.communityRating !== null) t.communityRating = full.communityRating;
      if (full.providers.length) t.providers = full.providers;
      t.genres = [...new Set([...t.genres, ...full.genres])];
      return f;
    }
    // AniList is the second source: it answers from the server where MyAnimeList's Jikan does not.
    const al = (await this.anilist.search(name).catch(() => [])).find((a) => alNames(a).some(same) && a.coverImage);
    const cover = al?.coverImage?.extraLarge || al?.coverImage?.large;
    if (cover) f.title.artwork = { ...f.title.artwork, posterUrl: cover };
    return f;
  }

  /**
   * A franchise whose latest season is airing now: ANN may not know its episode count yet (or repeats
   * the first season's), so the count comes from AniList: the total when announced, else what has aired.
   */
  private async withAiring(f: Franchise): Promise<Franchise> {
    const a = await this.anilist.airingNow(f.title.title).catch(() => null);
    const next = a?.nextAiringEpisode;
    if (!a || !next) return f;
    const target = airingSeason(f, a);
    if (!target) return f;
    // The watching order lists the same season: it must not keep ANN's count of the whole run.
    const part = f.title.watchOrder?.find((p) => p.kind === "season" && p.season === target.number);
    const lastEntry = part && f.entries.get(part.key.slice(4));
    // AniList counts a long run from its first episode, an entry of it from its own.
    const offset = lastEntry ? runOffset(f.entries, lastEntry) : 0;
    const aired = withinEntry(next.episode, offset) - 1;
    const total = a.episodes ? withinEntry(a.episodes, offset) : aired + (a.airingSchedule?.nodes?.length ?? 0);
    target.episodeCount = Math.max(total, aired);
    if (part) part.episodes = target.episodeCount;
    return f;
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
    const linked = await collectEntries([annId], this.ann, have);
    // A sequel ANN does not link ("Frieren" / "Frieren 2nd Season"): a TV entry that continues the root's name is a season of it.
    const rootKey = searchKey((linked.get(annId) ?? have.find((e) => e.id === annId))?.name ?? "");
    if (rootKey.length >= 5) {
      for (const e of have) {
        if (linked.has(e.id) || kindOf(e) !== "season" || e.type.toLowerCase() !== "tv") continue;
        const key = searchKey(e.name);
        // "Frieren 2nd Season", "JoJo's Bizarre Adventure: Stone Ocean": the root's name, then a space or a subtitle.
        if (key.startsWith(rootKey) && /^[\s:：\-–—]/u.test(key.slice(rootKey.length))) linked.set(e.id, e);
      }
    }
    return this.withAiringSeason(linked, rootKey);
  }

  /**
   * The season airing now that ANN does not list (or lists as something else): AniList knows it, so
   * it joins the franchise as an entry of its own. Without it the card stops at the last season ANN has.
   */
  private async withAiringSeason(linked: Map<string, AnimeEntry>, rootKey: string): Promise<Map<string, AnimeEntry>> {
    const root = [...linked.values()].find((e) => searchKey(e.name) === rootKey) ?? [...linked.values()][0];
    if (!root || rootKey.length < 5) return linked;
    const a = await this.anilist.airingNow(root.name).catch(() => null);
    const start = a && alDate(a);
    if (!a || !start || !a.nextAiringEpisode) return linked;
    const when = Date.parse(start);
    const covered = [...linked.values()].some((e) => kindOf(e) === "season" && e.start && Math.abs(Date.parse(e.start.length === 4 ? `${e.start}-07-01` : e.start.length === 7 ? `${e.start}-15` : e.start) - when) < 200 * 86_400_000);
    if (covered) return linked;
    const name = alNames(a).find((n) => searchKey(n).startsWith(rootKey)) ?? alNames(a)[0]!;
    linked.set(`al${a.id}`, {
      id: `al${a.id}`,
      type: "TV",
      name,
      picture: a.coverImage?.extraLarge || a.coverImage?.large || null,
      plot: (a.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700),
      genres: [],
      episodes: a.episodes ?? null,
      start,
      runtimeMinutes: a.duration ?? null,
      related: [],
      episodeNames: [],
    });
    return linked;
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
    const mal = MAL_ID.exec(id);
    if (mal) {
      const record = await this.jikan.byId(mal[1]!);
      return record ? toSeries(record) : null;
    }
    const al = AL_ID.exec(id);
    if (al) {
      const record = await this.anilist.byId(al[1]!);
      return record ? alSeries(record) : null;
    }
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
    const calendar = series.filter((t) => MAL_ID.test(t.id));
    const listed = series.filter((t) => AL_ID.test(t.id));
    const rest = series.filter((t) => !ANIME_ID.test(t.id) && !MAL_ID.test(t.id) && !AL_ID.test(t.id));
    const [base, own, announced, announcedAl] = await Promise.all([
      this.base.nextSeasons(rest, today),
      Promise.all(
        ours.map(async (t): Promise<Release | null> => {
          const f = await this.franchise(ANIME_ID.exec(t.id)![1]!);
          const next = f?.title.seasons.find((s) => s.airDate && s.airDate > today);
          return f && next ? { title: f.title, date: next.airDate!, season: next.number } : null;
        }),
      ),
      // Announced in the season calendar and not out yet: its first season is the one to wait for.
      Promise.all(
        calendar.map(async (t): Promise<Release | null> => {
          const record = await this.jikan.byId(MAL_ID.exec(t.id)![1]!);
          const series = record && toSeries(record);
          if (!record || !series || record.status !== "Not yet aired") return null;
          const date = airDate(record);
          return date && date <= today ? null : { title: series, date, season: 1 };
        }),
      ),
      Promise.all(
        listed.map(async (t): Promise<Release | null> => {
          const record = await this.anilist.byId(AL_ID.exec(t.id)![1]!);
          const series = record && alSeries(record);
          if (!record || !series || record.status !== "NOT_YET_RELEASED") return null;
          const date = alDate(record);
          return date && date <= today ? null : { title: series, date, season: 1 };
        }),
      ),
    ]);
    const some = (list: (Release | null)[]) => list.filter((r): r is Release => r !== null);
    // A series that airs an episode a week is not "between seasons": say when the next episode comes.
    const airing = await this.airingEpisodes(series.filter((t) => t.type === "anime" || isAnimeish(t)), today);
    const others = [...base, ...some(own), ...some(announced), ...some(announcedAl)].filter((r) => !airing.has(r.title.id));
    return [...others, ...airing.values()];
  }

  /** The next episode of every series in the list that is airing now, by the title's id. */
  private async airingEpisodes(series: readonly Title[], today: string): Promise<Map<string, Release>> {
    const found = await Promise.all(
      series.map(async (t): Promise<[string, Release] | null> => {
        const a = await this.anilist.airingNow(t.title);
        const next = a?.nextAiringEpisode;
        if (!a || !next) return null;
        const date = italianDay(new Date(next.airingAt * 1000));
        if (date < today) return null;
        // In a franchise the airing series is its latest season.
        const season = ANIME_ID.test(t.id) && t.type !== "movie" ? (t.seasons.filter((s) => !s.airDate || s.airDate <= today).at(-1)?.number ?? null) : null;
        return [t.id, { title: t, date, season, episode: next.episode }];
      }),
    );
    return new Map(found.filter((x): x is [string, Release] => x !== null));
  }

  async related(title: Title, limit: number): Promise<Title[]> {
    // The parts of an anime franchise are in its own watching order, not separate titles.
    return ANIME_ID.test(title.id) || MAL_ID.test(title.id) || AL_ID.test(title.id) ? [] : this.base.related(title, limit);
  }

  async episodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
    const m = ANIME_ID.exec(id);
    if (MAL_ID.test(id) || AL_ID.test(id)) return null;
    if (!m) return this.base.episodes(id, season);
    const f = await this.franchise(m[1]!);
    const part = f?.title.watchOrder?.find((p) => p.kind === "season" && p.season === season);
    const entry = part && f?.entries.get(part.key.slice(4));
    if (!entry) return null;
    // A later entry of a long run may number its episodes from the start of the run.
    const offset = runOffset(f!.entries, entry);
    const names = new Map(entry.episodeNames.map((e) => [withinEntry(e.number, offset), e.name]));
    const air = entry.start && entry.start.length === 10 ? entry.start : null;
    const fromSeason = f!.title.seasons.find((x) => x.number === season)?.episodeCount ?? 0;
    // The airing season: when each coming episode is out, from AniList's schedule.
    const dates = new Map<number, string>();
    let airing = false;
    const a = await this.anilist.airingNow(f!.title.title).catch(() => null);
    if (a && season === airingSeason(f!, a)?.number) {
      airing = Boolean(a.nextAiringEpisode);
      for (const n of a?.airingSchedule?.nodes ?? []) dates.set(withinEntry(n.episode, offset), italianDay(new Date(n.airingAt * 1000)));
    }
    // ANN may give an airing season the count of the whole run (Black Clover: 170): the season's own count wins.
    const count = airing && fromSeason > 0 ? Math.max(fromSeason, ...dates.keys()) : Math.max(withinEntry(entry.episodes ?? 0, offset), fromSeason, names.size, ...dates.keys());
    // Titles ANN does not list: the same season on TMDB, when it has exactly these episodes.
    const theirs = names.size < count ? await this.tmdbNames(f!.title, season, count) : new Map<number, string>();
    return Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      name: names.get(i + 1) ?? theirs.get(i + 1) ?? null,
      airDate: dates.get(i + 1) ?? (i === 0 ? air : null),
      runtimeMinutes: entry.runtimeMinutes,
    }));
  }

  /**
   * The franchise page of a show known by these names, or null when ANN has no TV entry of that name.
   * Throws when ANN could not be asked at all, so "not found" never covers a failed request.
   */
  private async mainShow(names: readonly string[]): Promise<Title | null> {
    const keys = new Set(names.map(searchKey));
    // The full name first, then what comes before a subtitle ("Frieren: Beyond Journey's End" -> "Frieren").
    const queries = [...new Set(names.flatMap((n) => [n, n.split(/\s*[:：]\s*/)[0]!.trim()]).filter((q) => q.length >= 4))].slice(0, 4);
    let failures = 0;
    for (const query of queries) {
      try {
        const exact = (await this.ann.search(query)).find((e) => kindOf(e) === "season" && keys.has(searchKey(e.name)));
        const f = exact && (await this.franchise(exact.id, [exact]));
        if (f) return f.title;
      } catch (err) {
        failures++;
        console.error("finding the main show of a new season failed", err);
      }
    }
    if (failures === queries.length) throw new Error("ANN could not be asked");
    return null;
  }

  /** Episode titles of a season from the TMDB catalogue; empty unless it lists as many episodes as we expect. */
  private async tmdbNames(title: Title, season: number, count: number): Promise<Map<number, string>> {
    try {
      const match = await this.base.match(title);
      if (!match || !/^tmdb-tv-/.test(match.id)) return new Map();
      const list = await this.base.episodes(match.id, season);
      if (!list || list.length !== count) return new Map();
      return new Map(list.flatMap((e) => (e.name ? [[e.number, e.name] as const] : [])));
    } catch {
      return new Map();
    }
  }

  /**
   * TMDB's week, plus the anime airing now that people watch most (TMDB barely lists them). AniList
   * lists every season as an entry of its own: each one stands for the show's first season here,
   * which opens as the whole franchise.
   */
  async trending(limit: number): Promise<Title[]> {
    const [base, airing] = await Promise.all([this.base.trending(limit), this.anilist.trending()]);
    const roots = (await Promise.all(airing.slice(0, 12).map((a) => this.anilist.rootOf(a)))).map((r) => r.root);
    const known = new Set(base.map((t) => searchKey(t.title)));
    const extra: Title[] = [];
    for (const a of roots) {
      const title = alSeries(a);
      if (!title || alNames(a).some((n) => known.has(searchKey(n)))) continue;
      alNames(a).forEach((n) => known.add(searchKey(n)));
      extra.push(title);
    }
    return [...base, ...extra];
  }
  discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage> {
    return this.base.discover(query, limit);
  }
  similarTo(seeds: readonly Title[], limit: number): Promise<Title[]> {
    return this.base.similarTo(seeds, limit);
  }
  searchPeople(query: string, limit: number): Promise<PersonHit[]> {
    return this.base.searchPeople(query, limit);
  }
  person(id: string): Promise<PersonDetails | null> {
    return this.base.person(id);
  }
  cast(title: Title, limit: number): Promise<CastMember[]> {
    return this.base.cast(title, limit);
  }
  match(title: Title): Promise<Title | null> {
    return this.base.match(title);
  }
  /**
   * The catalogue's releases, plus anime of the coming seasons from MyAnimeList's calendar that the
   * catalogue does not have (the platform is not known for those, so they are marked "seasonal").
   */
  async upcoming(type: MediaType | "all", today: string, limit: number): Promise<Release[]> {
    const base = await this.base.upcoming(type, today, limit);
    if (type !== "all" && type !== "anime") return base;
    const known = new Set(base.map((r) => searchKey(r.title.title)));
    const horizon = addDays(today, 365);
    const listed = await this.anilist.upcoming();
    const within = (date: string | null) => date === null || (date > today && date <= horizon);
    const calendar: Release[] = [];
    const rootsSeen = new Set<string>();
    // A season of a show that already exists opens that show's page: the card stands for its first season,
    // marked with the number of the new season. A brand-new show is its own card.
    const resolved = await Promise.all(listed.filter((a) => within(alDate(a))).slice(0, 25).map(async (a) => ({ a, ...(await this.anilist.rootOf(a)) })));
    const sequels: { a: AniListAnime; root: AniListAnime; depth: number; title: Title }[] = [];
    for (const { a, root, depth } of resolved) {
      const alTitle = alSeries(root);
      if (!alTitle) continue;
      if (depth > 0) {
        if (rootsSeen.has(alTitle.id)) continue;
        rootsSeen.add(alTitle.id);
        alNames(root).forEach((n) => known.add(searchKey(n)));
        alNames(a).forEach((n) => known.add(searchKey(n)));
        sequels.push({ a, root, depth, title: alTitle });
        continue;
      } else if (!alNames(a).some((n) => known.has(searchKey(n)))) {
        alNames(a).forEach((n) => known.add(searchKey(n)));
        calendar.push({ title: alTitle, date: alDate(a), season: null, venue: "seasonal" });
      }
    }
    // The show's own page (all its seasons) is the franchise; AniList's entry is only the fallback.
    // The lookups run together under a time budget, so a slow ANN never holds the page up: what
    // did not answer in time keeps the AniList card, without claiming the main show is missing.
    const looked = await Promise.all(
      sequels.map(async ({ root }, i) => {
        if (i >= MAX_MAIN_LOOKUPS) return { main: null, tried: false };
        const main = await Promise.race([
          this.mainShow(alNames(root)).catch(() => "failed" as const),
          new Promise<"late">((r) => setTimeout(() => r("late"), MAIN_LOOKUP_BUDGET_MS)),
        ]);
        // Too slow or ANN down: keep AniList's card without claiming the main show is missing.
        return main === "late" || main === "failed" ? { main: null, tried: false } : { main, tried: true };
      }),
    );
    sequels.forEach(({ a, depth, title }, i) => {
      const { main, tried } = looked[i];
      calendar.push({ title: main ?? title, date: alDate(a), season: depth + 1, venue: "seasonal", ...(main || !tried ? {} : { mainNotFound: true }) });
    });
    const seasonal = calendar
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
      // Announced without a date: a few, so they do not crowd the row.
      .filter((r, i, all) => r.date !== null || all.filter((x, j) => x.date === null && j <= i).length <= 5)
      .slice(0, limit);
    return [...base, ...seasonal];
  }
}

