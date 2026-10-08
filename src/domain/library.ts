import type { LibraryEntry, MediaType, Title, WatchProgress, WatchStatus } from "./types";

export type LibraryTypeFilter = "all" | MediaType;
/** No "planned": what to watch next lives in the wishlist. */
export type LibraryStatusFilter = "all" | "completed" | "watching";
export type LibrarySort = "recent" | "rating" | "title" | "added";

export interface LibraryItem {
  entry: LibraryEntry;
  title: Title;
}

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "In corso",
  completed: "Visto",
  planned: "Da vedere",
  dropped: "Abbandonato",
};

export function filterLibrary(items: LibraryItem[], type: LibraryTypeFilter, status: LibraryStatusFilter): LibraryItem[] {
  return items.filter(
    (i) => (type === "all" || i.title.type === type) && (status === "all" || i.entry.status === status),
  );
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

export function sortLibrary(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const out = [...items];
  switch (sort) {
    case "recent":
      return out.sort((a, b) => time(b.entry.lastWatchedAt) - time(a.entry.lastWatchedAt) || time(b.entry.addedAt) - time(a.entry.addedAt));
    case "rating":
      return out.sort((a, b) => (b.entry.rating ?? -1) - (a.entry.rating ?? -1) || a.title.title.localeCompare(b.title.title, "it"));
    case "title":
      return out.sort((a, b) => a.title.title.localeCompare(b.title.title, "it"));
    case "added":
      return out.sort((a, b) => time(b.entry.addedAt) - time(a.entry.addedAt));
  }
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

/** How far through a whole series the viewer is: earlier seasons, earlier episodes, and this one's fraction. */
export function seriesProgress(title: Title, progress: Pick<WatchProgress, "season" | "episode" | "fraction">): number | null {
  if (title.type === "movie" || !progress.season || !progress.episode) return null;
  const total = title.seasons.reduce((n, s) => n + s.episodeCount, 0);
  if (total === 0) return null;
  const before = title.seasons.filter((s) => s.number < progress.season!).reduce((n, s) => n + s.episodeCount, 0);
  return Math.min(1, (before + progress.episode - 1 + progress.fraction) / total);
}
