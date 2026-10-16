import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import type { EpisodeInfo } from "@/integrations/catalog/types";
import { FALLBACK_EPISODE_MINUTES, FALLBACK_FILM_MINUTES, groupRows, summarize, type GroupResult, type HistoryRow, type Wrapped, type WatchGroup } from "@/lib/wrapped";
import { searchKey } from "@/lib/text";
import { matchWithin } from "./import-list";
import { match } from "./import-history";

/**
 * The year in Netflix: titles found in the catalogue, each play measured by its
 * episode's own length (or the season's average, or the series' usual length).
 * No AI: only name matching and TMDB.
 */
export async function buildWrapped(year: number, rows: readonly HistoryRow[]): Promise<Wrapped> {
  const groups = groupRows(rows);
  const titles = await matchWithin(groups, (g) => match({ title: g.title, kind: g.kind, season: g.season, sample: g.sample }));
  const results: GroupResult[] = [];
  for (const [i, group] of groups.entries()) results.push(await measure(group, titles[i] ?? null));
  return summarize(year, groups, results);
}

async function measure(group: WatchGroup, title: Title | null): Promise<GroupResult> {
  const name = title?.title ?? group.title;
  const posterUrl = title?.artwork.posterUrl ?? null;
  const isFilm = title ? title.type === "movie" : group.kind === "film";
  const guess = isFilm ? FALLBACK_FILM_MINUTES : FALLBACK_EPISODE_MINUTES;

  const play = (row: WatchGroup["rows"][number], minutes: number | null | undefined, fallback: number) => {
    // A play with its own length (ViewingActivity.csv) is exact whatever the catalogue says.
    if (row.seconds !== undefined) return { minutes: row.seconds / 60, estimated: false };
    return minutes && minutes > 0 ? { minutes, estimated: false } : { minutes: fallback, estimated: true };
  };

  if (!title) return { name, posterUrl, found: false, isFilm, plays: group.rows.map((r) => play(r, null, guess)) };
  if (title.type === "movie") return { name, posterUrl, found: true, isFilm, plays: group.rows.map((r) => play(r, title.runtimeMinutes, guess)) };

  // A series: each episode by its name inside its season; the season's average when the name is not found.
  const usual = title.episodeRuntimeMinutes > 0 ? title.episodeRuntimeMinutes : FALLBACK_EPISODE_MINUTES;
  const seasons = new Map<number, EpisodeInfo[] | null>();
  for (const s of new Set(group.rows.flatMap((r) => (r.season ? [r.season] : [])))) {
    seasons.set(s, await getCatalog().episodes(title.id, s).catch(() => null));
  }
  const plays = group.rows.map((row) => {
    const list = row.season ? seasons.get(row.season) : null;
    const key = searchKey(row.episode);
    const exact = key ? list?.find((e) => e.name && searchKey(e.name) === key)?.runtimeMinutes : null;
    if (exact) return play(row, exact, usual);
    const lengths = (list ?? []).flatMap((e) => (e.runtimeMinutes ? [e.runtimeMinutes] : []));
    const average = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null;
    // The season's average is a guess too: it counts as estimated, but a close one.
    const p = play(row, average, usual);
    return row.seconds !== undefined ? p : { ...p, estimated: true };
  });
  return { name, posterUrl, found: true, isFilm: false, plays };
}
