import type { Presence, ProviderId, Title, WatchProgress } from "./types";

/** Heartbeats arrive every minute; after this much silence the viewer has stopped. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000;
/** Longest gap between two heartbeats that still counts as watching time. */
const MAX_GAP_MINUTES = 2;
/** Watching time is stored in chunks, so a long film is a few rows, not hundreds. */
export const FLUSH_MINUTES = 10;

export function isLive(p: Presence, now: Date): boolean {
  return now.getTime() - Date.parse(p.updatedAt) < PRESENCE_TTL_MS;
}

export interface Detected {
  providerId: ProviderId;
  externalId: string;
  label: string | null;
  season: number | null;
  episode: number | null;
  url: string;
}

export interface PresenceStep {
  presence: Presence;
  /** A session that ended and should have its remaining minutes stored. */
  ended: Presence | null;
  /** Whole minutes of this session to store now. */
  flushMinutes: number;
  /** True when this observation started a new session. */
  started: boolean;
}

/**
 * Folds one observation into the user's presence. Pure: storage and side
 * effects (watch events, activity) are the caller's job.
 */
export function nextPresence(userId: string, prev: Presence | null, seen: Detected, now: Date): PresenceStep {
  const live = prev !== null && isLive(prev, now);
  const same = live && prev.providerId === seen.providerId && prev.externalId === seen.externalId;
  const at = now.toISOString();

  if (!same) {
    return {
      presence: {
        userId,
        ...seen,
        titleId: null,
        // Keep the shared room and guests when moving to the next episode.
        partyUrl: live ? prev.partyUrl : null,
        guestIds: live ? prev.guestIds : [],
        startedAt: at,
        updatedAt: at,
        pendingMinutes: 0,
      },
      ended: prev,
      flushMinutes: 0,
      started: true,
    };
  }

  const gap = Math.min((now.getTime() - Date.parse(prev.updatedAt)) / 60_000, MAX_GAP_MINUTES);
  const pending = prev.pendingMinutes + Math.max(0, gap);
  const flushMinutes = prev.titleId && pending >= FLUSH_MINUTES ? Math.floor(pending) : 0;
  return {
    presence: {
      ...prev,
      label: seen.label ?? prev.label,
      season: seen.season ?? prev.season,
      episode: seen.episode ?? prev.episode,
      updatedAt: at,
      pendingMinutes: pending - flushMinutes,
    },
    ended: null,
    flushMinutes,
    started: false,
  };
}

/** Minutes of an ended session still worth storing (at least one whole minute, with a title). */
export function remainingMinutes(p: Presence): number {
  return p.titleId ? Math.floor(p.pendingMinutes) : 0;
}

/** Only https links to a shared room are accepted, and shown with their host name. */
export function normalizePartyUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Netflix's player sometimes names only the episode ("E3"). The season is the
 * one the viewer was on, or the next one when they had reached that season's
 * last episode and this is a first episode. Null when nothing is known.
 */
export function inferSeason(title: Title, prev: Pick<WatchProgress, "season" | "episode"> | null, episode: number): number | null {
  if (title.type === "movie") return null;
  if (!prev?.season) return title.seasons.length === 1 ? title.seasons[0]!.number : null;
  const current = title.seasons.find((s) => s.number === prev.season);
  const finished = current && prev.episode !== null && prev.episode >= current.episodeCount;
  if (episode === 1 && finished && title.seasons.some((s) => s.number === prev.season! + 1)) return prev.season + 1;
  return prev.season;
}
