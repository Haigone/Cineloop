import type { Title, WatchEvent } from "@/domain/types";

/**
 * Wrapped: the year in watching, worked out from the viewing the library
 * already holds (watch events), with plain arithmetic: no AI, no file to load.
 */

export interface WrappedTitle {
  titleId: string;
  name: string;
  posterUrl: string | null;
  minutes: number;
  /** Episodes (series, anime) or 1 for a film watched once. */
  plays: number;
  isFilm: boolean;
}

export interface Wrapped {
  year: number;
  totalMinutes: number;
  /** Part of the total that is a guess: the import records the day, not the length (film runtime, or one usual episode a day). */
  estimatedMinutes: number;
  episodes: number;
  films: number;
  /** Different shows and films. */
  titles: number;
  top: WrappedTitle[];
  /** January to December. */
  months: number[];
  busiestMonth: number | null;
}

/** What a film costs when the catalogue knows no length, and a usual episode. */
const FALLBACK_FILM_MINUTES = 100;
const FALLBACK_EPISODE_MINUTES = 45;

/** A play with no recorded minutes (a Netflix history import): the title's usual length. */
function guess(title: Title | undefined, isFilm: boolean): number {
  if (title?.type === "movie") return title.runtimeMinutes > 0 ? title.runtimeMinutes : FALLBACK_FILM_MINUTES;
  if (title && title.episodeRuntimeMinutes > 0) return title.episodeRuntimeMinutes;
  return isFilm ? FALLBACK_FILM_MINUTES : FALLBACK_EPISODE_MINUTES;
}

/** Years that have viewing, latest first. */
export function wrappedYears(events: readonly Pick<WatchEvent, "watchedAt">[]): number[] {
  return [...new Set(events.map((e) => new Date(e.watchedAt).getUTCFullYear()))].sort((a, b) => b - a);
}

/** Adds the year's viewing up. Pure: the same events always give the same page. */
export function summarizeYear(year: number, events: readonly WatchEvent[], titles: ReadonlyMap<string, Title>, topCount = 5): Wrapped {
  const months = Array<number>(12).fill(0);
  const byTitle = new Map<string, WrappedTitle>();
  let total = 0;
  let estimated = 0;
  let episodes = 0;
  let films = 0;

  for (const e of events) {
    const at = new Date(e.watchedAt);
    if (at.getUTCFullYear() !== year) continue;
    const title = titles.get(e.titleId);
    const isFilm = title ? title.type === "movie" : e.season === null && e.episode === null;
    const known = e.minutes > 0;
    const minutes = known ? e.minutes : guess(title, isFilm);
    months[at.getUTCMonth()]! += minutes;
    total += minutes;
    if (!known) estimated += minutes;
    if (isFilm) films += 1;
    else episodes += 1;
    const row = byTitle.get(e.titleId);
    if (row) {
      row.minutes += minutes;
      row.plays += 1;
    } else {
      byTitle.set(e.titleId, { titleId: e.titleId, name: title?.title ?? "Titolo sconosciuto", posterUrl: title?.artwork.posterUrl ?? null, minutes, plays: 1, isFilm });
    }
  }

  const best = Math.max(...months);
  return {
    year,
    totalMinutes: Math.round(total),
    estimatedMinutes: Math.round(estimated),
    episodes,
    films,
    titles: byTitle.size,
    top: [...byTitle.values()].sort((a, b) => b.minutes - a.minutes).slice(0, topCount).map((t) => ({ ...t, minutes: Math.round(t.minutes) })),
    months: months.map((m) => Math.round(m)),
    busiestMonth: best > 0 ? months.indexOf(best) : null,
  };
}
