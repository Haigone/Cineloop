import type { SharedWatch, WatchProgress } from "./types";

/** The most people a "Serata insieme" can hold, host included. */
export const MAX_SHARED_MEMBERS = 12;

/** How a member's place changed, to repeat for the rest of the group. */
export type SharedMove = "progress" | "finished" | "seenThrough";

/** The group this user follows a title with, if any. A user is in at most one group per title. */
export function groupFor(groups: readonly SharedWatch[], userId: string, titleId: string): SharedWatch | null {
  return groups.find((g) => g.titleId === titleId && g.memberIds.includes(userId)) ?? null;
}

/**
 * Another member's place after one member moved: the same season, episode and
 * minute. Each keeps their own service unless `takeService` (the host moved:
 * the host's service is the night's), and the link only when it still points
 * to the right episode (theirs, or the mover's on the same service). Null when
 * nothing would change.
 */
export function mirroredProgress(moved: WatchProgress, theirs: WatchProgress | null, watching: boolean, takeService = false): WatchProgress | null {
  const sameEpisode = theirs?.season === moved.season && theirs?.episode === moved.episode;
  // The host's service is everyone's: a change of service alone is worth a write.
  const sameService = !takeService || !moved.providerId || theirs?.providerId === moved.providerId;
  if (watching && theirs && sameEpisode && sameService && Math.abs(theirs.fraction - moved.fraction) < 0.01) return null;
  const providerId = takeService && moved.providerId ? moved.providerId : (theirs?.providerId ?? moved.providerId);
  const url = providerId === moved.providerId ? moved.url : sameEpisode ? (theirs?.url ?? null) : null;
  return { titleId: moved.titleId, providerId, season: moved.season, episode: moved.episode, fraction: moved.fraction, url, updatedAt: moved.updatedAt };
}

/** "Luca", "Luca e Sara", "Luca, Sara e Elena". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}
