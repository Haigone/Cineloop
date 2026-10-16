import { parseCsv, parseHistoryTitle } from "../../extension/netflix-export.js";

/**
 * Wrapped: the year in Netflix, worked out from the viewing history with plain
 * arithmetic (no AI). This file is the pure part, shared by the browser (which
 * reads the CSV: it never leaves the computer) and the server (which looks up durations).
 */

/** One play in the history. */
export interface HistoryRow {
  /** The row's title as Netflix wrote it. */
  raw: string;
  month: number;
  /** The play's own length, when the file has it (ViewingActivity.csv): exact, no lookup needed. */
  seconds?: number;
}

/** What a series costs when the catalogue knows no length, and a film. */
export const FALLBACK_EPISODE_MINUTES = 45;
export const FALLBACK_FILM_MINUTES = 100;

const secondsOf = (duration: string) => {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(duration.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

/** "10/14/26", "14/10/26" or "2026-10-14 21:00:00" → year, month, and the two numbers that could be either. */
function readDate(text: string): { year: number; a: number; b: number; iso: boolean } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
  if (iso) return { year: Number(iso[1]), a: Number(iso[2]), b: Number(iso[3]), iso: true };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text.trim());
  if (!m) return null;
  const y = Number(m[3]);
  return { year: y < 100 ? 2000 + y : y, a: Number(m[1]), b: Number(m[2]), iso: false };
}

/**
 * Plays by year from NetflixViewingHistory.csv ("Title", "Date") or ViewingActivity.csv.
 * Trailers and plays under two minutes (when the file says) are left out. Null for any other file.
 */
export function readYears(text: string): Map<number, HistoryRow[]> | null {
  const [header, ...rows] = parseCsv(text) as string[][];
  if (!header) return null;
  const names = header.map((h) => h.trim().toLowerCase());
  const titleAt = names.indexOf("title");
  const dateAt = names.includes("date") ? names.indexOf("date") : names.indexOf("start time");
  if (titleAt < 0 || dateAt < 0) return null;
  const durationAt = names.indexOf("duration");
  const supplementalAt = names.indexOf("supplemental video type");

  const dated = rows.flatMap((r) => {
    const title = (r[titleAt] ?? "").trim();
    const date = readDate(r[dateAt] ?? "");
    if (!title || !date) return [];
    if (supplementalAt >= 0 && (r[supplementalAt] ?? "").trim()) return [];
    const seconds = durationAt >= 0 ? secondsOf(r[durationAt] ?? "") : null;
    if (seconds !== null && seconds < 120) return [];
    return [{ title, date, seconds }];
  });
  // Slashed dates are month first in Netflix's English file; a first number above 12 says day first.
  const dayFirst = dated.some((d) => !d.date.iso && d.date.a > 12);

  const years = new Map<number, HistoryRow[]>();
  for (const { title, date, seconds } of dated) {
    const month = date.iso || !dayFirst ? date.a : date.b;
    if (month < 1 || month > 12) continue;
    const list = years.get(date.year) ?? [];
    list.push({ raw: title, month, ...(seconds !== null ? { seconds } : {}) });
    years.set(date.year, list);
  }
  return years;
}

/** The plays of one show or film. */
export interface WatchGroup {
  title: string;
  kind: "series" | "film" | "unknown";
  /** Highest season seen. */
  season?: number;
  /** The row as Netflix wrote it, for the error list. */
  sample: string;
  rows: (HistoryRow & { season?: number; episode: string })[];
}

/** One group per series (all its episodes) or film, in the order first watched. */
export function groupRows(rows: readonly HistoryRow[]): WatchGroup[] {
  const groups = new Map<string, WatchGroup>();
  for (const row of rows) {
    const p = parseHistoryTitle(row.raw) as { title: string; kind: WatchGroup["kind"]; season?: number; sample: string };
    if (!p.title.trim()) continue;
    const key = `${p.kind}:${p.title.toLowerCase().replace(/\s+/g, " ")}`;
    const episode = p.kind === "film" ? "" : (p.sample.split(": ").at(-1) ?? "");
    const entry = { ...row, ...(p.season ? { season: p.season } : {}), episode };
    const known = groups.get(key);
    if (!known) groups.set(key, { title: p.title, kind: p.kind, season: p.season, sample: p.sample, rows: [entry] });
    else {
      known.rows.push(entry);
      if (p.season && p.season > (known.season ?? 0)) known.season = p.season;
    }
  }
  return [...groups.values()];
}

/** What the server worked out for one group. */
export interface GroupResult {
  /** The catalogue's name for it, or the group's own when nothing was found. */
  name: string;
  posterUrl: string | null;
  found: boolean;
  isFilm: boolean;
  /** Minutes of each row, in the group's order; `estimated` when the length was guessed. */
  plays: { minutes: number; estimated: boolean }[];
}

export interface WrappedTitle {
  name: string;
  posterUrl: string | null;
  minutes: number;
  plays: number;
  isFilm: boolean;
}

export interface Wrapped {
  year: number;
  totalMinutes: number;
  /** Minutes that come from a guess (average runtime, or a fixed value when the title was not found). */
  estimatedMinutes: number;
  episodes: number;
  films: number;
  /** Different shows and films. */
  titles: number;
  top: WrappedTitle[];
  /** January to December. */
  months: number[];
  busiestMonth: number | null;
  /** Names the catalogue did not know: their length is estimated. */
  notFound: string[];
}

/** Adds the groups' plays up. Pure: the same input always gives the same page. */
export function summarize(year: number, groups: readonly WatchGroup[], results: readonly GroupResult[], topCount = 5): Wrapped {
  const months = Array<number>(12).fill(0);
  let total = 0;
  let estimated = 0;
  let episodes = 0;
  let films = 0;
  const titles: WrappedTitle[] = [];
  const notFound: string[] = [];

  groups.forEach((group, i) => {
    const res = results[i]!;
    let minutes = 0;
    group.rows.forEach((row, n) => {
      const play = res.plays[n] ?? { minutes: 0, estimated: true };
      minutes += play.minutes;
      if (play.estimated) estimated += play.minutes;
      months[row.month - 1]! += play.minutes;
      if (res.isFilm) films += 1;
      else episodes += 1;
    });
    total += minutes;
    if (!res.found) notFound.push(group.sample);
    titles.push({ name: res.name, posterUrl: res.posterUrl, minutes, plays: group.rows.length, isFilm: res.isFilm });
  });

  const top = [...titles].sort((a, b) => b.minutes - a.minutes).slice(0, topCount);
  const best = Math.max(...months);
  return {
    year,
    totalMinutes: Math.round(total),
    estimatedMinutes: Math.round(estimated),
    episodes,
    films,
    titles: titles.length,
    top: top.map((t) => ({ ...t, minutes: Math.round(t.minutes) })),
    months: months.map((m) => Math.round(m)),
    busiestMonth: best > 0 ? months.indexOf(best) : null,
    notFound,
  };
}
