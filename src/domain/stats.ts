import type { Genre, LibraryEntry, Title, WatchEvent, WishlistItem } from "./types";

export interface WeeklyStats {
  minutes: number;
  movies: number;
  episodes: number;
  completed: number;
  wishlisted: number;
  topGenre: Genre | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekStart(now: Date): Date {
  return new Date(now.getTime() - WEEK_MS);
}

/**
 * Rolling seven-day summary. Watch minutes are estimates from runtimes:
 * CineLoop tracks what you watch, not the exact seconds.
 */
export function computeWeeklyStats(input: {
  now: Date;
  events: WatchEvent[];
  library: LibraryEntry[];
  wishlist: WishlistItem[];
  titles: Map<string, Title>;
}): WeeklyStats {
  const since = weekStart(input.now).getTime();
  const inWeek = (iso: string | null) => iso != null && Date.parse(iso) >= since && Date.parse(iso) <= input.now.getTime();

  const events = input.events.filter((e) => inWeek(e.watchedAt));
  const genreMinutes = new Map<Genre, number>();
  let movies = 0;
  let episodes = 0;
  let minutes = 0;

  for (const e of events) {
    const title = input.titles.get(e.titleId);
    minutes += e.minutes;
    if (title?.type === "movie") movies++;
    else episodes++;
    // The first genre is the title's primary one; weight it fully, others half.
    title?.genres.forEach((g, i) => genreMinutes.set(g, (genreMinutes.get(g) ?? 0) + e.minutes * (i === 0 ? 1 : 0.5)));
  }

  let topGenre: Genre | null = null;
  let best = 0;
  for (const [g, m] of genreMinutes) {
    if (m > best) {
      best = m;
      topGenre = g;
    }
  }

  return {
    minutes,
    movies,
    episodes,
    completed: input.library.filter((e) => e.status === "completed" && inWeek(e.lastWatchedAt)).length,
    wishlisted: input.wishlist.filter((w) => inWeek(w.addedAt)).length,
    topGenre,
  };
}

/** Minutes per day for the last 7 days, oldest first (for the activity strip). */
export function dailyMinutes(events: WatchEvent[], now: Date): number[] {
  const days = Array.from({ length: 7 }, () => 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (const e of events) {
    const d = new Date(e.watchedAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (diff >= 0 && diff < 7) days[6 - diff]! += e.minutes;
  }
  return days;
}
