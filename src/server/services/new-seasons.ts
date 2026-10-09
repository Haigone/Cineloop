import "server-only";
import type { LibraryEntry, SeasonSummary, Title } from "@/domain/types";
import { newSeasons } from "@/domain/library";
import { getCatalog } from "@/integrations/catalog";
import type { Repository } from "@/server/data";
import { cacheTitles } from "./explore";

export interface NewSeasonItem {
  title: Title;
  /** The seasons out since the user last watched, oldest first. */
  seasons: SeasonSummary[];
  seenThrough: number;
}

/** At most this many finished series are checked against the catalogue per page view. */
const CHECK_LIMIT = 30;

/**
 * "Novità": series the user had finished (up to a known season) that have a
 * newer season out. The catalogue is asked for each one's current seasons
 * (its answers are cached for a day), since a cached title would never learn
 * about a season added after it was saved.
 */
export async function listNewSeasons(repo: Repository, entries: readonly LibraryEntry[], titles: Map<string, Title>, today: string): Promise<NewSeasonItem[]> {
  const finished = entries
    .filter((e) => e.status === "completed" && e.seenThrough != null && titles.get(e.titleId)?.type !== "movie")
    .sort((a, b) => Date.parse(b.lastWatchedAt ?? b.addedAt) - Date.parse(a.lastWatchedAt ?? a.addedAt))
    .slice(0, CHECK_LIMIT);

  const fresh = await Promise.all(
    finished.map(async (e) => {
      const known = titles.get(e.titleId);
      const latest = await getCatalog()
        .getTitle(e.titleId)
        .catch(() => null);
      if (!latest || latest.type === "movie" || !known || known.type === "movie") return known;
      const changed = JSON.stringify(latest.seasons) !== JSON.stringify(known.seasons);
      if (!changed) return known;
      const updated = { ...known, seasons: latest.seasons, episodeRuntimeMinutes: known.episodeRuntimeMinutes || latest.episodeRuntimeMinutes };
      await cacheTitles(repo, [updated]);
      return updated;
    }),
  );

  return finished
    .map((entry, i) => {
      const title = fresh[i];
      const seasons = title ? newSeasons(entry, title, today) : [];
      return title && seasons.length ? { title, seasons, seenThrough: entry.seenThrough! } : null;
    })
    .filter((x): x is NewSeasonItem => x !== null)
    .sort((a, b) => (b.seasons.at(-1)!.airDate ?? "").localeCompare(a.seasons.at(-1)!.airDate ?? ""));
}

/** "Stagione 5 nuova" or "Stagioni 4–5 nuove". */
export function newSeasonsLabel(item: NewSeasonItem): string {
  const first = item.seasons[0]!.number;
  const last = item.seasons.at(-1)!.number;
  return first === last ? `Stagione ${first} nuova` : `Stagioni ${first}–${last} nuove`;
}
