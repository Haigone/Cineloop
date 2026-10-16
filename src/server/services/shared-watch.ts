import "server-only";
import { groupFor, joinNames, mirroredProgress, type SharedMove } from "@/domain/shared-watch";
import type { PublicUser, SharedWatch, Title } from "@/domain/types";
import { episodeLabel, firstName } from "@/lib/format";
import type { Repository } from "@/server/data";
import { toPublicUser } from "./shared";

/**
 * "Serate insieme": after a member's place in a title changes (by hand, from
 * the extension, skipping filler, finishing it), every other member of their
 * group gets the same place. Members who were not watching it yet start.
 */
export async function shareProgress(repo: Repository, userId: string, titleId: string, how: SharedMove = "progress"): Promise<void> {
  const group = groupFor(await repo.listSharedWatches(userId), userId, titleId);
  if (!group) return;
  const mine = (await repo.listLibrary(userId)).find((e) => e.titleId === titleId);
  if (!mine) return;
  const others = group.memberIds.filter((id) => id !== userId);
  // The host picks the service for the whole night: the others' "Continua a guardare" opens it too.
  const takeService = userId === group.hostId;
  let newEpisode = false;
  for (const memberId of others) {
    const theirs = (await repo.listLibrary(memberId)).find((e) => e.titleId === titleId);
    if (how === "finished") {
      if (theirs?.status !== "completed") await repo.markFinished(memberId, titleId, mine.seenThrough ?? null);
    } else if (how === "seenThrough") {
      if (mine.seenThrough != null && theirs?.seenThrough !== mine.seenThrough) await repo.markSeenThrough(memberId, titleId, mine.seenThrough);
    } else if (mine.progress) {
      const next = mirroredProgress(mine.progress, theirs?.progress ?? null, theirs?.status === "watching", takeService);
      if (!next) continue;
      if (theirs?.progress?.season !== next.season || theirs?.progress?.episode !== next.episode) newEpisode = true;
      await repo.saveProgress(memberId, next);
      await repo.removeFromWishlist(memberId, titleId);
    }
  }
  await repo.updateSharedWatch(group.id, { updatedBy: userId, updatedAt: new Date().toISOString() });
  // A word to the others when the group moves to another episode or finishes, not at every minute.
  if (how === "progress" && !newEpisode) return;
  const [mover, title] = await Promise.all([repo.getUserById(userId), repo.getTitlesByIds([titleId]).then((t) => t[0])]);
  if (!mover || !title) return;
  const where = how === "finished" ? "alla fine" : how === "seenThrough" ? `alla fine della stagione ${mine.seenThrough}` : `a ${episodeLabel(mine.progress!) ?? "un nuovo episodio"}`;
  for (const memberId of others) {
    if (!(await repo.getPreferences(memberId)).notifyWatchParty) continue;
    await repo.createNotification({
      userId: memberId,
      kind: "watch-party",
      message: `${firstName(mover.displayName)} ha portato ${title.title} ${where}: il punto è aggiornato per tutta la serata.`,
      href: `/title/${titleId}`,
      at: new Date().toISOString(),
    });
  }
}

/**
 * Starts members on the group's place: the place of whoever already has one,
 * the host first. Used when a group is created and when someone joins.
 */
export async function alignMembers(repo: Repository, group: SharedWatch, newcomers: readonly string[]): Promise<void> {
  // Joining an existing group: its place wins. A new group: the host's, else the first member's who has one.
  const existing = group.memberIds.filter((id) => !newcomers.includes(id));
  const pool = existing.length > 0 ? existing : group.memberIds;
  const order = [...pool.filter((id) => id === group.hostId), ...pool.filter((id) => id !== group.hostId)];
  for (const id of order) {
    const entry = (await repo.listLibrary(id)).find((e) => e.titleId === group.titleId);
    if (!entry) continue;
    if (entry.progress) {
      for (const memberId of newcomers) {
        if (memberId === id) continue;
        const theirs = (await repo.listLibrary(memberId)).find((e) => e.titleId === group.titleId);
        const next = mirroredProgress(entry.progress, theirs?.progress ?? null, theirs?.status === "watching", id === group.hostId);
        if (next) await repo.saveProgress(memberId, next);
        await repo.removeFromWishlist(memberId, group.titleId);
      }
      return;
    }
  }
}

export interface SharedWatchView {
  id: string;
  title: Title;
  /** Who organised it: they choose the service and can manage or end the night. */
  hostId: string;
  /** Everyone in it but the viewer. */
  others: PublicUser[];
  /** "Con Luca e Sara". */
  withLabel: string;
  /** Who moved the shared place last, when it was not the viewer. */
  updatedBy: string | null;
  updatedAt: string | null;
}

/** The viewer's groups with their titles and people, for Home and the title page. */
export async function listSharedWatchViews(repo: Repository, viewerId: string, titles: ReadonlyMap<string, Title>): Promise<SharedWatchView[]> {
  const groups = await repo.listSharedWatches(viewerId);
  const ids = [...new Set(groups.flatMap((g) => g.memberIds))].filter((id) => id !== viewerId);
  const users = new Map((await Promise.all(ids.map((id) => repo.getUserById(id)))).filter((u) => u !== null).map((u) => [u.id, toPublicUser(u)]));
  const missing = groups.filter((g) => !titles.has(g.titleId)).map((g) => g.titleId);
  const extra = missing.length ? new Map((await repo.getTitlesByIds(missing)).map((t) => [t.id, t])) : new Map<string, Title>();
  return groups.flatMap((g) => {
    const title = titles.get(g.titleId) ?? extra.get(g.titleId);
    if (!title) return [];
    const others = g.memberIds.filter((id) => id !== viewerId).flatMap((id) => (users.has(id) ? [users.get(id)!] : []));
    const mover = g.updatedBy && g.updatedBy !== viewerId ? users.get(g.updatedBy) : null;
    return [{
      id: g.id,
      title,
      hostId: g.hostId,
      others,
      withLabel: others.length ? `Con ${joinNames(others.map((u) => firstName(u.displayName)))}` : "Solo tu, per ora",
      updatedBy: mover ? firstName(mover.displayName) : null,
      updatedAt: g.updatedAt,
    }];
  });
}
