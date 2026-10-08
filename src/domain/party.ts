import type { PartyState } from "./types";

/** What a member's extension reports every couple of seconds while in a room. */
export interface PlaybackReport {
  /** The Netflix /watch id the member is on. */
  externalId: string;
  position: number;
  paused: boolean;
  /** Set when the member themselves pressed play or pause. */
  action?: "play" | "pause";
}

/** A report older than this no longer says where someone is. */
const STALE_MS = 15_000;
/** Below this gap two players count as in sync. */
export const IN_SYNC_SECONDS = 4;

/** Folds a member's report into the room. Pure. */
export function applyReport(prev: PartyState | null, userId: string, report: PlaybackReport, now: Date): PartyState {
  const at = now.toISOString();
  const base: PartyState = prev ?? { paused: report.paused, position: report.position, at, by: userId, seq: 0, members: {} };
  const next: PartyState = {
    ...base,
    members: { ...base.members, [userId]: { externalId: report.externalId, position: report.position, paused: report.paused, at } },
  };
  if (report.action) {
    next.paused = report.action === "pause";
    next.position = report.position;
    next.at = at;
    next.by = userId;
    next.seq = base.seq + 1;
  }
  return next;
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
