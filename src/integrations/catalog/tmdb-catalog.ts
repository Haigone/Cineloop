import type { Genre, MediaType, ProviderId, Release, Title } from "@/domain/types";
import { addDays } from "@/lib/dates";
import { hashString } from "@/lib/hash";
import { searchKey } from "@/lib/text";
import { franchiseHead, franchiseKey, franchiseNames, withoutSeriesFilms } from "@/domain/franchise";
import type { CatalogService, DiscoverPage, DiscoverQuery, EpisodeInfo, NamePreference } from "./types";

/**
 * TMDB (themoviedb.org) catalog, via its official public API v3.
 * Requires a read access token (TMDB_READ_TOKEN). TMDB's terms require the
 * attribution "This product uses the TMDB API but is not endorsed or
 * certified by TMDB", shown in the app footer when this source is active.
 *
 * Ids are namespaced ("tmdb-movie-603", "tmdb-tv-1396") so they never clash
 * with other sources. List endpoints (search, trending, discover) carry
 * enough data for a card, so a grid costs one request, not one per title;
 * `getTitle` fetches the full record when a title page is opened.
 */

const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";

/** TMDB genre ids (movie and TV lists) mapped onto CineLoop genres. */
const GENRE_MAP: Record<number, Genre> = {
  28: "Azione",
  10759: "Azione",
  12: "Avventura",
  16: "Animazione",
  35: "Commedia",
  80: "Crime",
  18: "Dramma",
  878: "Fantascienza",
  10765: "Fantascienza",
  14: "Fantasy",
  27: "Horror",
  9648: "Mistero",
  10749: "Romance",
  53: "Thriller",
};

/**
 * The reverse map, for browsing. TMDB's TV list has no horror, romance or
 * thriller genre, so those browse films only.
 */
const GENRE_IDS: Record<Genre, { movie: number[]; tv: number[] }> = {
  Azione: { movie: [28], tv: [10759] },
  Animazione: { movie: [16], tv: [16] },
  Avventura: { movie: [12], tv: [10759] },
  Commedia: { movie: [35], tv: [35] },
  Crime: { movie: [80], tv: [80] },
  Dramma: { movie: [18], tv: [18] },
  Fantascienza: { movie: [878], tv: [10765] },
  Fantasy: { movie: [14], tv: [10765] },
  Horror: { movie: [27], tv: [] },
  Mistero: { movie: [9648], tv: [9648] },
  Romance: { movie: [10749], tv: [] },
  Thriller: { movie: [53], tv: [] },
};

/**
 * TMDB "watch provider" ids for the services CineLoop knows. Availability
 * comes from JustWatch through TMDB (attribution in the footer), for Italy.
 */
const PROVIDER_IDS: Partial<Record<ProviderId, number>> = {
  netflix: 8,
  "prime-video": 119,
  "disney-plus": 337,
  "apple-tv": 350,
  now: 39,
  crunchyroll: 283,
};
const PROVIDER_BY_TMDB = new Map(Object.entries(PROVIDER_IDS).map(([id, n]) => [n, id as ProviderId]));
const REGION = "IT";

interface TmdbEpisodeRef {
  air_date?: string | null;
  season_number: number;
  episode_number: number;
}

/** Shape shared by list items and full records; details add the rest. */
interface TmdbItem {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  vote_average?: number | null;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string;
  /** List endpoints send ids; detail endpoints send objects. */
  genre_ids?: number[];
  genres?: { id: number }[];
  runtime?: number | null;
  episode_run_time?: number[];
  seasons?: { season_number: number; episode_count: number; air_date?: string | null; name?: string }[];
  /** TV details: what aired last and what airs next, when TMDB knows. */
  status?: string;
  last_episode_to_air?: TmdbEpisodeRef | null;
  next_episode_to_air?: TmdbEpisodeRef | null;
  /** Present when requested with append_to_response=watch/providers. */
  "watch/providers"?: { results?: Record<string, WatchOffers> };
  /** Film details: the saga it is part of ("Bleach - Collezione"). */
  belongs_to_collection?: { name?: string } | null;
}

/** One country's offers (JustWatch data through TMDB). */
interface WatchOffers {
  flatrate?: { provider_id: number }[];
  free?: { provider_id: number }[];
  ads?: { provider_id: number }[];
}

/** The known services a title is included on in Italy: by subscription, free or with ads. */
function servicesIn(results: Record<string, WatchOffers> | undefined): ProviderId[] {
  const it = results?.[REGION];
  const ids = [...(it?.flatrate ?? []), ...(it?.free ?? []), ...(it?.ads ?? [])].map((p) => PROVIDER_BY_TMDB.get(p.provider_id));
  return [...new Set(ids.filter((p): p is ProviderId => Boolean(p)))];
}

interface TmdbList {
  results?: TmdbItem[];
  total_pages?: number;
}

type Fetch = typeof fetch;

export class TmdbCatalog implements CatalogService {
  readonly name = "tmdb";
  readonly complete = true;
  constructor(
    private token: string,
    private language = "it-IT",
    private fetcher: Fetch = fetch,
  ) {}

  async search(query: string, limit: number): Promise<Title[]> {
    const q = query.trim();
    if (!q) return [];
    const items = (await this.list(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`)).filter(
      (i) => i.media_type === "movie" || i.media_type === "tv",
    );
    const titles = await this.withSeries(mapItems(items, limit + 10), items);
    // A film from an anime series found along with that series sits on the series' page instead.
    return withoutSeriesFilms(titles).slice(0, limit);
  }

  /** Marks the anime films among `titles` with the series they come from. */
  private async withSeries(titles: Title[], items: TmdbItem[]): Promise<Title[]> {
    const byId = new Map(items.map((i) => [`tmdb-${i.media_type}-${i.id}`, i]));
    return Promise.all(
      titles.map(async (t) => {
        const item = byId.get(t.id);
        if (t.type !== "movie" || !item || (!isAnime(item) && item.id !== 1669841)) return t;
        return { ...t, partOf: await this.seriesOf(item) };
      }),
    );
  }

  private seriesCache = new Map<string, Promise<string | null>>();

  /**
   * The anime series a film comes from, or null for a film of its own: a
   * Japanese animated series named like the film's title before its subtitle,
   * or like its saga ("Demon Slayer - Il treno Mugen" → "Demon Slayer").
   */
  async seriesOf(film: TmdbItem): Promise<string | null> {
    // TMDB classifies this Bleach-related film separately from the original anime.
    if (film.id === 1669841) return "tmdb-tv-30984";
    if (!isAnime(film)) return null;
    for (const name of franchiseNames([film.title, film.original_title], film.belongs_to_collection?.name)) {
      const key = searchKey(name);
      let pending = this.seriesCache.get(key);
      if (!pending) {
        pending = this.list(`/search/tv?query=${encodeURIComponent(name)}&include_adult=false`).then((shows) => {
          const hit = shows.find(
            (s) => (s.original_language ?? "ja") === "ja" && (s.genre_ids ?? []).includes(16) && [s.name, s.original_name].some((n) => n && searchKey(n) === key),
          );
          return hit ? `tmdb-tv-${hit.id}` : null;
        });
        this.seriesCache.set(key, pending);
      }
      const found = await pending;
      if (found) return found;
    }
    return null;
  }

  async related(title: Title, limit: number): Promise<Title[]> {
    const own = parseId(title.id);
    if (!own) return [];
    const name = title.type === "movie" && title.partOf ? ((await this.getTitle(title.partOf))?.title ?? title.title) : title.title;
    const key = franchiseKey(name);
    if (!key) return [];
    const items = (await this.list(`/search/multi?query=${encodeURIComponent(franchiseHead(name))}&include_adult=false`)).filter(
      (i) => (i.media_type === "movie" || i.media_type === "tv") && `tmdb-${i.media_type}-${i.id}` !== title.id,
    );
    // Same franchise: a series of that name (other parts of it) or a film from that series.
    const same = items.filter((i) => (isAnime(i) || i.id === 1669841) && [i.title, i.name, i.original_title, i.original_name].some((n) => n && franchiseKey(n) === key));
    const titles = await this.withSeries(mapItems(same, limit * 2), same);
    return titles
      .filter((t) => t.type !== "movie" || t.partOf)
      .sort((a, b) => Number(a.type === "movie") - Number(b.type === "movie") || a.year - b.year)
      .slice(0, limit);
  }

  async episodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
    const parsed = parseId(id);
    if (!parsed || parsed.kind !== "tv") return null;
    try {
      const data = await this.get<{ episodes?: { episode_number: number; name?: string; air_date?: string | null; runtime?: number | null }[] }>(
        `/tv/${parsed.tmdbId}/season/${season}?`,
      );
      return (data.episodes ?? []).map((e) => ({
        number: e.episode_number,
        name: e.name && !/^(episodio|episode)\s*\d+$/i.test(e.name.trim()) ? e.name.trim() : null,
        airDate: e.air_date || null,
        runtimeMinutes: e.runtime ?? null,
      }));
    } catch {
      return null;
    }
  }

  async getTitle(id: string): Promise<Title | null> {
    const parsed = parseId(id);
    if (!parsed) return null;
    try {
      const details = await this.get<TmdbItem>(`/${parsed.kind}/${parsed.tmdbId}?append_to_response=watch/providers`);
      const title = toTitle(parsed.kind, details);
      const providers = servicesIn(details["watch/providers"]?.results);
      if (title.type === "movie") return { ...title, providers, partOf: await this.seriesOf(details) };
      return { ...title, providers };
    } catch {
      return null;
    }
  }

  async trending(limit: number): Promise<Title[]> {
    return mapItems(await this.list("/trending/all/week?"), limit);
  }

  async discover(query: DiscoverQuery, limit: number): Promise<DiscoverPage> {
    const page = Math.max(1, query.page ?? 1);
    const kinds: ("movie" | "tv")[] = query.type === "movie" ? ["movie"] : query.type === "all" ? ["movie", "tv"] : ["tv"];
    const provider = query.provider ? PROVIDER_IDS[query.provider] : undefined;
    // A service TMDB does not track has nothing to list.
    if (query.provider && !provider) return { titles: [], hasMore: false };
    const pages = await Promise.all(
      kinds.map(async (kind) => {
        const params = new URLSearchParams({ page: String(page), include_adult: "false", sort_by: sortParam(query.sort, kind) });
        // A minimum vote count keeps obscure entries with a single 10/10 out of "I più votati".
        if (query.sort === "top") params.set("vote_count.gte", "300");
        // With a service chosen, the whole catalogue matters, not just the well-known part.
        if (query.sort === "popular" && !provider) params.set("vote_count.gte", "50");
        const ids = query.genre ? GENRE_IDS[query.genre][kind] : [];
        if (query.genre && ids.length === 0) return { items: [], more: false };
        if (ids.length) params.set("with_genres", ids.join("|"));
        if (query.type === "anime") {
          params.set("with_original_language", "ja");
          params.set("with_genres", [...new Set([...ids, 16])].join(","));
        }
        if (provider) {
          params.set("with_watch_providers", String(provider));
          params.set("watch_region", REGION);
          params.set("with_watch_monetization_types", "flatrate");
        }
        const data = await this.listPage(`/discover/${kind}?${params}`);
        return { items: (data.results ?? []).map((i) => ({ ...i, media_type: kind }) as TmdbItem), more: (data.total_pages ?? 0) > page };
      }),
    );
    const merged = interleave(pages.map((p) => p.items)).filter((i) =>
      query.type === "anime" ? isAnime(i) : query.type !== "series" || !isAnime(i),
    );
    const titles = mapItems(merged, limit).map((t) => (query.provider ? { ...t, providers: [query.provider] } : t));
    return { titles, hasMore: pages.some((p) => p.more) };
  }

  async nextSeasons(series: readonly Title[], today: string): Promise<Release[]> {
    const found = await Promise.all(
      series.map(async (title): Promise<Release | null> => {
        if (title.type === "movie") return null;
        try {
          const id = parseId(title.id) ?? parseId((await this.match(title))?.id ?? "");
          if (!id || id.kind !== "tv") return null;
          const details = await this.get<TmdbItem>(`/tv/${id.tmdbId}?`);
          const next = nextSeasonOf(details, today);
          return next ? { title, ...next } : null;
        } catch {
          return null;
        }
      }),
    );
    return found.filter((r): r is Release => r !== null);
  }

  async upcoming(type: MediaType | "all", today: string, limit: number): Promise<Release[]> {
    const from = addDays(today, 1);
    const to = addDays(today, 180);
    const wantMovies = type === "all" || type === "movie";
    const wantTv = type !== "movie";
    // Query by date, not popularity: popularity-first page 1 misses many real
    // releases because a handful of blockbusters occupy the entire first page.
    const [movies, shows] = await Promise.all([
      wantMovies
        ? this.listPages(
            `/discover/movie?${new URLSearchParams({
              include_adult: "false",
              sort_by: "primary_release_date.asc",
              region: REGION,
              // Cinema (limited or wide) and streaming premieres in Italy.
              with_release_type: "2|3|4",
              "release_date.gte": from,
              "release_date.lte": to,
            })}`,
            5,
          )
        : Promise.resolve([]),
      wantTv
        ? this.listPages(
            `/discover/tv?${new URLSearchParams({
              include_adult: "false",
              sort_by: "first_air_date.asc",
              "first_air_date.gte": from,
              "first_air_date.lte": to,
              ...(type === "anime" ? { with_original_language: "ja", with_genres: "16" } : {}),
            })}`,
            5,
          )
        : Promise.resolve([]),
    ]);

    // Check enough films to replace records without a confirmed future Italian date.
    const films = await Promise.all(
      movies.slice(0, Math.max(limit * 3, limit)).map(async (item) => {
        const date = (await this.italianReleaseDate(item.id, from, to)) ?? item.release_date ?? null;
        return { title: toTitle("movie", item), date, season: null };
      }),
    );
    const series = shows
      .map((item) => ({ title: toTitle("tv", item), date: item.first_air_date || null, season: null }))
      .filter((r) => r.title.title && (type === "all" || r.title.type === type));

    const all: Release[] = [...films, ...series];
    return all
      .filter((r) => Boolean(r.title.title && r.date && r.date >= from && r.date <= to))
      .sort((a, b) => a.date!.localeCompare(b.date!))
      .slice(0, limit);
  }

  /** Fetch several discover pages so less-popular, but genuinely upcoming, titles are not omitted. */
  private async listPages(path: string, maxPages: number): Promise<TmdbItem[]> {
    const [endpoint, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("page", "1");
    const first = await this.listPage(`${endpoint}?${params}`);
    const total = Math.min(Math.max(1, first.total_pages ?? 1), maxPages);
    if (total === 1) return first.results ?? [];
    const rest = await Promise.all(
      Array.from({ length: total - 1 }, async (_, index) => {
        const next = new URLSearchParams(params);
        next.set("page", String(index + 2));
        return (await this.listPage(`${endpoint}?${next}`)).results ?? [];
      }),
    );
    return [...(first.results ?? []), ...rest.flat()];
  }

  private async italianReleaseDate(movieId: number, from: string, to: string): Promise<string | null> {
    try {
      const data = await this.get<{ results?: { iso_3166_1: string; release_dates: { release_date: string; type: number }[] }[] }>(
        `/movie/${movieId}/release_dates?`,
      );
      const dates = data.results?.find((r) => r.iso_3166_1 === REGION)?.release_dates ?? [];
      const future = dates
        .filter((d) => d.type >= 2 && d.type <= 4)
        .map((d) => d.release_date.slice(0, 10))
        .filter((date) => date >= from && date <= to)
        .sort()[0];
      return future ?? null;
    } catch {
      return null;
    }
  }

  async findByName(name: string, prefer: NamePreference): Promise<Title | null> {
    return this.byName(name, prefer, true);
  }

  private async byName(name: string, prefer: NamePreference, fuzzy: boolean): Promise<Title | null> {
    const q = name.trim();
    if (!q) return null;
    const key = searchKey(q);
    const items = (await this.list(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`)).filter(
      (i) => i.media_type === "tv" || (i.media_type === "movie" && !prefer.series),
    );
    const named = (i: TmdbItem) =>
      [i.title, i.name, i.original_title, i.original_name].some((n) => n && searchKey(n) === key);
    const exact = items.filter(named);
    if (!exact.length) {
      // "Show: Part" or "PART - Show" (Netflix writes both): with no title of the
      // whole name, the show is whichever side has a title of exactly that name.
      const dashed = /\s[-–—]\s/.test(q);
      const sides = q.split(/\s*:\s+|\s+[-–—]\s+/).filter((p) => p.length >= 2);
      // After a dash the show comes last ("STEEL BALL RUN - Le bizzarre avventure di JoJo").
      if (dashed) sides.reverse();
      if (sides.length > 1) {
        for (const side of sides) {
          const whole = await this.byName(side, { ...prefer, series: true }, false);
          if (whole) return whole;
        }
      }
      if (!fuzzy) return null;
    }
    // Among namesakes (or, with no exact name, the first few results), the one on this service wins.
    const pool = (exact.length ? exact : items).slice(0, exact.length ? 4 : 5);
    const onService = await this.availableOn(pool, prefer.provider);
    const pick = onService.length && (exact.length || onService.length === 1) ? onService[0] : exact[0];
    if (!pick) return null;
    const title = toTitle(pick.media_type as "movie" | "tv", pick);
    return onService.includes(pick) ? { ...title, providers: [prefer.provider] } : title;
  }

  /** The items streaming on this service in Italy, in order. */
  private async availableOn(items: TmdbItem[], provider: ProviderId): Promise<TmdbItem[]> {
    const id = PROVIDER_IDS[provider];
    if (!id || items.length === 0) return [];
    const checks = await Promise.all(
      items.map(async (i) => {
        try {
          const data = await this.get<{ results?: Record<string, WatchOffers> }>(`/${i.media_type}/${i.id}/watch/providers?`);
          return servicesIn(data.results).includes(provider);
        } catch {
          return false;
        }
      }),
    );
    return items.filter((_, n) => checks[n]);
  }

  async match(title: Title): Promise<Title | null> {
    if (parseId(title.id)) return title;
    const kind = title.type === "movie" ? "movie" : "tv";
    const items = await this.list(`/search/${kind}?query=${encodeURIComponent(title.title)}&include_adult=false`);
    // Same name (in Italian or the original) and a release year within one: remakes and namesakes differ on year.
    const key = searchKey(title.title);
    const near = items.map((i) => ({ i, t: toTitle(kind, i) })).filter(({ t }) => t.title && Math.abs(t.year - title.year) <= 1);
    const exact = near.find(({ t, i }) => searchKey(t.title) === key || searchKey(i.original_title ?? i.original_name ?? "") === key);
    return (exact ?? near[0])?.t ?? null;
  }

  async similarTo(seedTitles: readonly Title[], limit: number): Promise<Title[]> {
    const resolved = await Promise.all(seedTitles.map(async (t) => parseId(t.id) ?? parseId((await this.match(t))?.id ?? "")));
    const seeds = resolved.filter((p): p is { kind: "movie" | "tv"; tmdbId: string } => p !== null);
    if (seeds.length === 0) return [];
    const lists = await Promise.all(
      seeds.map(async (s) => {
        try {
          return await this.list(`/${s.kind}/${s.tmdbId}/recommendations?`).then((items) =>
            items.map((i) => ({ ...i, media_type: i.media_type ?? s.kind }) as TmdbItem),
          );
        } catch {
          return [];
        }
      }),
    );
    // Round-robin across seeds so one favourite cannot fill the whole row.
    return mapItems(interleave(lists), limit);
  }

  private async list(path: string): Promise<TmdbItem[]> {
    return (await this.listPage(path)).results ?? [];
  }

  private async listPage(path: string): Promise<TmdbList> {
    try {
      return await this.get<TmdbList>(path);
    } catch (err) {
      console.error("TMDB request failed", err);
      return {};
    }
  }

  private async get<T>(path: string): Promise<T> {
    const sep = path.includes("?") ? (path.endsWith("?") ? "" : "&") : "?";
    const res = await this.fetcher(`${API}${path}${sep}language=${this.language}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      // Catalog data changes slowly; let the platform cache it for a day.
      next: { revalidate: 86_400 },
    } as RequestInit);
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }
}

/**
 * The season after the last one aired, when TMDB lists it: either because its
 * first episode is scheduled, or because the season exists (renewed) with or
 * without a date yet. Exported for tests.
 */
export function nextSeasonOf(d: TmdbItem, today: string): { season: number; date: string | null } | null {
  if (d.status === "Ended" || d.status === "Canceled") return null;
  const lastAired = d.last_episode_to_air?.season_number ?? 0;
  const next = d.next_episode_to_air;
  if (next && next.season_number > lastAired && next.episode_number === 1) {
    return { season: next.season_number, date: next.air_date || null };
  }
  const announced = (d.seasons ?? [])
    .filter((s) => s.season_number > lastAired && s.season_number > 0 && (!s.air_date || s.air_date > today))
    .sort((a, b) => a.season_number - b.season_number)[0];
  return announced ? { season: announced.season_number, date: announced.air_date || null } : null;
}

function parseId(id: string): { kind: "movie" | "tv"; tmdbId: string } | null {
  const m = /^tmdb-(movie|tv)-(\d+)$/.exec(id);
  return m ? { kind: m[1] as "movie" | "tv", tmdbId: m[2]! } : null;
}

function sortParam(sort: DiscoverQuery["sort"], kind: "movie" | "tv") {
  if (sort === "top") return "vote_average.desc";
  if (sort === "recent") return kind === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  return "popularity.desc";
}

/** Takes one from each list in turn, so every source is represented early. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]!);
  }
  return out;
}

function isAnime(i: TmdbItem) {
  const genres = i.genre_ids ?? i.genres?.map((g) => g.id) ?? [];
  return i.original_language === "ja" && genres.includes(16);
}

function mapItems(items: TmdbItem[], limit: number): Title[] {
  const out: Title[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.media_type !== "movie" && item.media_type !== "tv") continue;
    const title = toTitle(item.media_type, item);
    // Entries without a name are placeholders TMDB has not filled in yet.
    if (!title.title || seen.has(title.id)) continue;
    seen.add(title.id);
    out.push(title);
    if (out.length >= limit) break;
  }
  return out;
}

/** Pure mapping, exported for tests. Works for list items and full records. */
export function toTitle(kind: "movie" | "tv", d: TmdbItem): Title {
  const ids = d.genres?.map((g) => g.id) ?? d.genre_ids ?? [];
  const genres = [...new Set(ids.map((id) => GENRE_MAP[id]).filter((g): g is Genre => Boolean(g)))];
  const date = d.release_date || d.first_air_date || "";
  const base = {
    id: `tmdb-${kind}-${d.id}`,
    title: (d.title ?? d.name ?? "").trim(),
    year: Number(date.slice(0, 4)) || 0,
    genres: genres.length ? genres : (["Dramma"] as Genre[]),
    overview: d.overview ?? "",
    communityRating: d.vote_count === 0 || d.vote_average == null ? null : Math.round(d.vote_average * 10) / 10,
    artwork: {
      posterUrl: d.poster_path ? `${IMAGE}/w500${d.poster_path}` : null,
      backdropUrl: d.backdrop_path ? `${IMAGE}/w1280${d.backdrop_path}` : null,
      palette: paletteFor(d.id),
    },
    // Where to watch needs a separate, region-specific call; left empty until wired.
    providers: [],
  };
  if (kind === "movie") return { ...base, type: "movie", runtimeMinutes: d.runtime ?? 0 };
  return {
    ...base,
    type: (isAnime(d) ? "anime" : "series") as Exclude<MediaType, "movie">,
    seasons: (d.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({
        number: s.season_number,
        episodeCount: s.episode_count,
        // "Stagione 3" says nothing; a part's own name ("Stone Ocean") does.
        ...(s.air_date ? { airDate: s.air_date } : {}),
        ...(s.name && !/^(stagione|season|temporada|saison|staffel)\s*\d+$/i.test(s.name.trim()) ? { name: s.name.trim() } : {}),
      })),
    episodeRuntimeMinutes: d.episode_run_time?.[0] ?? 0,
  };
}

/** Fallback colours for generated art while a poster loads or is missing. */
function paletteFor(id: number): readonly [string, string, string] {
  const hue = hashString(String(id)) % 360;
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`];
}
