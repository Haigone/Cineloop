import type { LibraryEntry, SeasonSummary, Title, WatchPart } from "./types";

/** The override key for "watch the filler episodes too". */
export const FILLER_KEY = "filler";

export type Overrides = LibraryEntry["partOverrides"];

/**
 * What a part counts as before the user chooses: parts known not to be canon
 * are left out, and so are OVAs and specials unless a source says they are canon.
 */
export function includedByDefault(part: WatchPart): boolean {
  if (part.canon === false) return false;
  if (part.kind === "ova" || part.kind === "special") return part.canon === true;
  return true;
}

export function isIncluded(part: WatchPart, overrides: Overrides): boolean {
  return overrides?.[part.key] ?? includedByDefault(part);
}

/** Filler episodes are skipped unless the user asked to watch them. */
export function skipsFiller(overrides: Overrides): boolean {
  return overrides?.[FILLER_KEY] !== true;
}

export function watchOrderOf(title: Title): WatchPart[] {
  return title.type === "movie" ? [] : (title.watchOrder ?? []);
}

/** Seasons the user plans to watch: all of them, or only the included ones for an anime with a watching order. */
export function plannedSeasons(title: Title, overrides: Overrides): SeasonSummary[] {
  if (title.type === "movie") return [];
  const order = watchOrderOf(title);
  if (order.length === 0) return title.seasons;
  const out = new Set(order.filter((p) => p.kind === "season" && p.season !== undefined && isIncluded(p, overrides)).map((p) => p.season));
  return title.seasons.filter((s) => out.has(s.number));
}

/** The last episode of a season that is worth watching: trailing filler counts as already done. */
export function lastWantedEpisode(title: Title, season: number, overrides: Overrides): number {
  if (title.type === "movie") return 0;
  const count = title.seasons.find((s) => s.number === season)?.episodeCount ?? 0;
  const part = watchOrderOf(title).find((p) => p.kind === "season" && p.season === season);
  if (!part?.filler?.length || !skipsFiller(overrides)) return count;
  const filler = new Set(part.filler);
  let last = count;
  while (last > 0 && filler.has(last)) last--;
  return last;
}

/** True for an episode the user skips (filler, with the default choice). */
export function isSkippedEpisode(title: Title, season: number, episode: number, overrides: Overrides): boolean {
  if (!skipsFiller(overrides)) return false;
  return Boolean(watchOrderOf(title).find((p) => p.kind === "season" && p.season === season)?.filler?.includes(episode));
}

/** A run of filler episodes the viewer is about to meet, and the first episode after it. */
export interface FillerRun {
  season: number;
  from: number;
  to: number;
  /** The first episode that is not filler; null when the season ends in filler. */
  after: number | null;
}

/**
 * Whether the episode after `at` starts a run of filler (default choice: fillers are skipped).
 * Consecutive filler episodes are one run.
 */
export function fillerRunAfter(title: Title, at: { season: number | null; episode: number | null }, overrides: Overrides): FillerRun | null {
  if (title.type === "movie" || at.season === null || at.episode === null || !skipsFiller(overrides)) return null;
  const part = watchOrderOf(title).find((p) => p.kind === "season" && p.season === at.season);
  const filler = new Set(part?.filler ?? []);
  const from = at.episode + 1;
  if (!filler.has(from)) return null;
  const count = title.seasons.find((s) => s.number === at.season)?.episodeCount ?? Infinity;
  let to = from;
  while (filler.has(to + 1)) to++;
  return { season: at.season, from, to, after: to + 1 <= count ? to + 1 : null };
}
