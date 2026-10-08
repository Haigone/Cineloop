import type { Genre, LibraryEntry, MediaType, PublicUser, RatingValue, Title, WatchStatus, WishlistItem } from "@/domain/types";

/** Small builders so each test states only what it cares about. */

export function title(id: string, type: MediaType = "movie", genres: Genre[] = ["Dramma"], extra: Partial<Title> = {}): Title {
  const base = {
    id,
    title: id,
    year: 2020,
    genres,
    overview: "",
    communityRating: 7,
    artwork: { posterUrl: null, backdropUrl: null, palette: ["#000", "#111", "#222"] as const },
    providers: [],
  };
  return (type === "movie"
    ? { ...base, type, runtimeMinutes: 120, ...extra }
    : { ...base, type, seasons: [{ number: 1, episodeCount: 8 }], episodeRuntimeMinutes: 45, ...extra }) as Title;
}

export function user(id: string): PublicUser {
  return { id, username: id, displayName: id[0]!.toUpperCase() + id.slice(1), avatarUrl: null, bio: null };
}

export function entry(userId: string, titleId: string, status: WatchStatus = "completed", rating: RatingValue | null = null, lastWatchedAt: string | null = null): LibraryEntry {
  return { userId, titleId, status, addedAt: "2026-01-01T00:00:00.000Z", lastWatchedAt, rating, progress: null };
}

export function wish(userId: string, titleId: string, position = 0, suggestedBy: string | null = null): WishlistItem {
  return { userId, titleId, addedAt: "2026-01-01T00:00:00.000Z", position, suggestedBy };
}

export function titleMap(...titles: Title[]): Map<string, Title> {
  return new Map(titles.map((t) => [t.id, t]));
}
