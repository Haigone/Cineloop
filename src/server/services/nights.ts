import "server-only";
import { groupFor } from "@/domain/shared-watch";
import type { ProviderId, Title, WatchParty } from "@/domain/types";
import { firstName } from "@/lib/format";
import type { Repository } from "@/server/data";
import { alignMembers } from "./shared-watch";

/**
 * A night starting now becomes a "Serata insieme": everyone in it follows the
 * title together on Home, with one shared place. Whoever has no place yet starts
 * from the beginning (first episode, or the start of the film).
 */
export async function startNight(repo: Repository, party: WatchParty, title: Title): Promise<void> {
  const members = [...new Set([party.hostId, ...party.participantIds])];
  const now = new Date().toISOString();
  const placeOf = async (id: string) => (await repo.listLibrary(id)).find((e) => e.titleId === title.id);
  // The host's place and service are the night's: whoever has none yet starts from the beginning.
  const start = (id: string, providerId: ProviderId | null) =>
    repo.saveProgress(id, {
      titleId: title.id,
      providerId,
      season: title.type === "movie" ? null : (title.seasons[0]?.number ?? 1),
      episode: title.type === "movie" ? null : 1,
      fraction: 0,
      url: null,
      updatedAt: now,
    });
  const host = await placeOf(party.hostId);
  if (!host?.progress || host.status !== "watching") await start(party.hostId, host?.progress?.providerId ?? title.providers[0] ?? null);
  const hostProvider = (await placeOf(party.hostId))?.progress?.providerId ?? title.providers[0] ?? null;

  const existing = groupFor(await repo.listSharedWatches(party.hostId), party.hostId, title.id);
  // Someone already following this title with another group stays in that one.
  const free: string[] = [];
  for (const id of members) {
    if (existing?.memberIds.includes(id)) continue;
    if (!groupFor(await repo.listSharedWatches(id), id, title.id)) free.push(id);
  }
  if (existing) {
    const added = free.filter((id) => id !== party.hostId);
    if (added.length > 0) {
      const next = { ...existing, memberIds: [...existing.memberIds, ...added] };
      await repo.updateSharedWatch(existing.id, { memberIds: next.memberIds });
      await alignMembers(repo, next, added);
    }
  } else if (free.includes(party.hostId) && free.length > 1) {
    const group = await repo.createSharedWatch({ titleId: title.id, hostId: party.hostId, memberIds: free });
    await alignMembers(repo, group, group.memberIds);
  }
  for (const id of members) {
    const entry = await placeOf(id);
    if (!entry?.progress || entry.status !== "watching") await start(id, hostProvider);
    await repo.removeFromWishlist(id, title.id);
  }
  await repo.setWatchPartyStatus(party.id, "started");
}

/** Tells the other people of a night that it was organised, and when it is. */
export async function announceNight(repo: Repository, party: WatchParty, title: Title, hostName: string): Promise<void> {
  const when =
    party.status === "scheduled" && party.scheduledFor
      ? `per ${new Date(party.scheduledFor).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`
      : party.status === "queued"
        ? "in coda, dopo le serate in corso"
        : "da adesso";
  const pending = new Set(party.pendingParticipantIds ?? []);
  const recipients = [...new Set([...party.participantIds, ...pending])];
  for (const id of recipients) {
    if (id === party.hostId || !(await repo.getPreferences(id)).notifyWatchParty) continue;
    const invited = pending.has(id);
    await repo.createNotification({
      userId: id,
      kind: "watch-party",
      message: invited
        ? `${firstName(hostName)} ti invita a una serata insieme: ${title.title}, ${when}.`
        : `${firstName(hostName)} ha organizzato una serata insieme: ${title.title}, ${when}.`,
      href: invited ? `/watch-party?invite=${encodeURIComponent(party.id)}` : party.status === "started" ? `/title/${title.id}` : "/watch-party",
      at: new Date().toISOString(),
    });
  }
}

/**
 * Starts the host's nights that are due: a scheduled one once its time comes,
 * the first queued one once every night already started is finished.
 * Called when Home or the nights page opens, so nothing needs a timer.
 */
export async function activateNights(repo: Repository, hostId: string, now: Date = new Date()): Promise<boolean> {
  const parties = (await repo.listWatchParties(hostId, 100)).filter((p) => p.hostId === hostId && p.pickedTitleId);
  const waiting = parties.filter((p) => p.status === "scheduled" || p.status === "queued");
  if (waiting.length === 0) return false;
  const ids = [...new Set(waiting.map((p) => p.pickedTitleId!))];
  const titles = new Map((await repo.getTitlesByIds(ids)).map((t) => [t.id, t]));
  let changed = false;
  for (const p of waiting.filter((p) => p.status === "scheduled" && p.scheduledFor && Date.parse(p.scheduledFor) <= now.getTime())) {
    const title = titles.get(p.pickedTitleId!);
    if (title) {
      await startNight(repo, p, title);
      changed = true;
    }
  }
  const queued = waiting.filter((p) => p.status === "queued").sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (queued.length > 0) {
    const library = await repo.listLibrary(hostId);
    const started = (await repo.listWatchParties(hostId, 100)).filter((p) => p.hostId === hostId && p.status === "started" && p.pickedTitleId);
    const running = started.some((p) => library.find((e) => e.titleId === p.pickedTitleId)?.status === "watching");
    const title = titles.get(queued[0]!.pickedTitleId!);
    if (!running && title) {
      await startNight(repo, queued[0]!, title);
      changed = true;
    }
  }
  return changed;
}
