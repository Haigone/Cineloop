import type { LibraryEntry, MediaType, Title, WatchStatus } from "./types";

export type LibraryTypeFilter = "all" | MediaType;
export type LibraryStatusFilter = "all" | "completed" | "watching" | "planned";
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
