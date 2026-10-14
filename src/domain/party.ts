import type { PartyState } from "./types";

/** What a member's extension reports every couple of seconds while in a room. */
export interface PlaybackReport {
  /** The Netflix /watch id the member is on. */
  externalId: string;
  position: number;
  paused: boolean;
  /** Set when the member themselves pressed play or pause, or moved to another point. */
  action?: "play" | "pause" | "seek";
  /**
   * False while the player is not on the room's clock: it has not yet had the
   * room's state (it just opened, or reopened the episode, and is autoplaying)
   * or it is still too far from it. The host's player leads only when true.
   */
  following?: boolean;
}

/** A report older than this no longer says where someone is. */
const STALE_MS = 15_000;
/** Below this gap two players count as in sync. */
export const IN_SYNC_SECONDS = 4;
/**
 * After someone presses play, pause or moves the bar, the host's player needs a
 * report or two to follow: until then its reports don't move the room back.
 */
const ACTION_GRACE_MS = 4_000;

/**
 * Folds a member's report into the room. Pure.
 *
 * The room's clock (`position` at `at`, running unless `paused`) is where every
 * player should be. A member's own play, pause or seek moves it; otherwise it
 * follows the host's player, so a friend who joins lands where the host is.
 */
export function applyReport(prev: PartyState | null, userId: string, report: PlaybackReport, now: Date, hostId?: string): PartyState {
  const at = now.toISOString();
  const base: PartyState = prev ?? { paused: report.paused, position: report.position, at, by: userId, seq: 0, members: {} };
  // The host moved to another episode: the room starts again from there.
  const newEpisode = userId === hostId && prev?.members[userId] !== undefined && prev.members[userId]!.externalId !== report.externalId;
  const next: PartyState = {
    ...base,
    members: { ...base.members, [userId]: { externalId: report.externalId, position: report.position, paused: report.paused, at } },
  };
  if (report.action) {
    next.paused = report.action === "seek" ? report.paused : report.action === "pause";
    // Play or pause from a player far from the room (just opened, still catching
    // up) changes the state only: the room stays where it is.
    const far = report.action !== "seek" && Math.abs(report.position - roomPosition(base, now)) > 2 * IN_SYNC_SECONDS;
    next.position = far ? roomPosition(base, now) : report.position;
    next.at = at;
    next.by = userId;
    next.last = report.action;
    next.seq = base.seq + 1;
  } else if (newEpisode) {
    next.paused = report.paused;
    next.position = report.position;
    next.at = at;
  } else if (userId === hostId && report.following !== false && hostHasSeen(base, userId) && now.getTime() - Date.parse(base.at) >= ACTION_GRACE_MS) {
    next.paused = report.paused;
    next.position = report.position;
    next.at = at;
  }
  return next;
}

/**
 * Has the host reported since the room's clock last moved? Only then did its
 * extension get the new state back, so its player can lead again. A host that
 * hears of the room late must not undo a guest's pause with its old state.
 */
function hostHasSeen(base: PartyState, hostId: string): boolean {
  const prev = base.members[hostId];
  return Boolean(prev) && Date.parse(prev!.at) >= Date.parse(base.at);
}

/** Where the room's clock is now. */
export function roomPosition(party: Pick<PartyState, "paused" | "position" | "at">, now: Date): number {
  const s = party.paused ? party.position : party.position + (now.getTime() - Date.parse(party.at)) / 1000;
  return Math.round(Math.max(0, s) * 10) / 10;
}

/** Where a member's player is now, from their last report. */
export function positionNow(m: PartyState["members"][string], now: Date): number {
  return m.paused ? m.position : m.position + (now.getTime() - Date.parse(m.at)) / 1000;
}

/**
 * Seconds `userId` is ahead (+) or behind (−) `otherId`, or null when either
 * has not reported recently or they are on different episodes.
 */
export function driftBetween(party: PartyState, userId: string, otherId: string, now: Date): number | null {
  const a = party.members[userId];
  const b = party.members[otherId];
  if (!a || !b || a.externalId !== b.externalId) return null;
  if (now.getTime() - Date.parse(a.at) > STALE_MS || now.getTime() - Date.parse(b.at) > STALE_MS) return null;
  return Math.round(positionNow(a, now) - positionNow(b, now));
}

/** The host's position for a "join me" link, when their player reported recently. */
export function hostPosition(party: PartyState | null, hostId: string, externalId: string | null, now: Date): number | null {
  const m = party?.members[hostId];
  if (!m || m.externalId !== externalId || now.getTime() - Date.parse(m.at) > STALE_MS) return null;
  return Math.floor(positionNow(m, now));
}

/** A Netflix /watch link that starts at `seconds` (Netflix reads `t`, in seconds). */
export function watchAt(url: string, seconds: number | null): string {
  if (seconds === null || seconds < 1) return url;
  const u = new URL(url);
  u.searchParams.set("t", String(Math.floor(seconds)));
  return u.toString();
}
