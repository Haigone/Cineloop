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
