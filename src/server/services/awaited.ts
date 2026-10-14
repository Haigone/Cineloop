import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";

/** The release a followed or wished-for series is waiting on. */
export interface AwaitedRelease {
  /** YYYY-MM-DD; null when the season is announced without a date. */
  date: string | null;
  /** The new season; null when the series is airing now and what is awaited is the next episode. */
  season: number | null;
  /** The next episode of a series that airs one a week. */
  episode?: number | null;
}

/** At most this many series are checked per page view; the catalogue answers are cached for a day. */
const CHECK_LIMIT = 30;

/**
 * For series the viewer has finished or wants to see: the season that has not
 * come out yet, or the next episode of one that is airing weekly, if the catalogue knows one. Series with nothing coming are left out.
 */
export async function awaitedReleases(series: readonly Title[], today: string): Promise<Map<string, AwaitedRelease>> {
  const candidates = series.filter((t) => t.type !== "movie").slice(0, CHECK_LIMIT);
  if (candidates.length === 0) return new Map();
  const found = await getCatalog()
    .nextSeasons(candidates, today)
    .catch(() => []);
  return new Map(
    found
      .filter((r) => (r.episode ? r.date === null || r.date >= today : r.season !== null && (r.date === null || r.date > today)))
      .map((r) => [r.title.id, { date: r.date, season: r.season, ...(r.episode ? { episode: r.episode } : {}) }] as const),
  );
}

/** At most this many wishlist titles are checked for a release date per page view. */
const PREMIERE_LIMIT = 30;

/**
 * Wishlist titles that are not out yet (or come out today), with their release date, soonest first.
 * Only titles of this year or later (year 0: no date yet) can still be waiting.
 */
export async function wishedPremieres(titles: readonly Title[], today: string): Promise<{ title: Title; release: AwaitedRelease }[]> {
  const thisYear = Number(today.slice(0, 4));
  const candidates = titles.filter((t) => t.year === 0 || t.year >= thisYear).slice(0, PREMIERE_LIMIT);
  if (candidates.length === 0) return [];
  const found = await getCatalog()
    .premieres(candidates, today)
    .catch(() => []);
  const byId = new Map(found.map((r) => [r.title.id, r]));
  return candidates
    .flatMap((title) => (byId.has(title.id) ? [{ title, release: { date: byId.get(title.id)!.date, season: null } }] : []))
    .sort((a, b) => (a.release.date ?? "9999").localeCompare(b.release.date ?? "9999"));
}
