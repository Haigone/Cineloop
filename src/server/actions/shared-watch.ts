"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { groupFor, MAX_SHARED_MEMBERS } from "@/domain/shared-watch";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "@/server/services/explore";
import { alignMembers } from "@/server/services/shared-watch";
import type { ActionResult } from "./library";

const titleId = z.string().min(1).max(120);
const friendIds = z.array(z.string().min(1).max(80)).min(1).max(MAX_SHARED_MEMBERS - 1);

/** Friends of the viewer among `ids` who are not already following this title with another group. */
async function invitable(viewerId: string, ids: readonly string[], forTitle: string) {
  const repo = getRepository();
  const friends = new Set((await repo.listFriends(viewerId)).map((f) => f.user.id));
  const out: string[] = [];
  for (const id of new Set(ids)) {
    if (id === viewerId || !friends.has(id)) continue;
    if (groupFor(await repo.listSharedWatches(id), id, forTitle)) continue;
    out.push(id);
  }
  return out;
}

async function tellInvited(inviterName: string, ids: readonly string[], title: { id: string; title: string }) {
  const repo = getRepository();
  for (const id of ids) {
    if (!(await repo.getPreferences(id)).notifyWatchParty) continue;
    await repo.createNotification({
      userId: id,
      kind: "watch-party",
      message: `${inviterName} ti ha aggiunto alla serata insieme di ${title.title}: i progressi ora sono condivisi.`,
      href: `/title/${title.id}`,
      at: new Date().toISOString(),
    });
  }
}

/**
 * "Serata insieme": the viewer and the friends they pick follow a series or
 * anime together. Everyone starts from the viewer's place (or, without one,
 * from the first member who has one), and from then on moves together.
 */
export async function startSharedWatch(id: string, ids: string[]): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedFriends = friendIds.safeParse(ids);
  const title = parsedId.success ? await ensureTitle(parsedId.data) : null;
  if (!title || !parsedFriends.success) return { ok: false, error: "Scegli almeno un amico." };
  if (title.type === "movie") return { ok: false, error: "Le serate insieme sono per serie e anime." };
  const repo = getRepository();
  if (groupFor(await repo.listSharedWatches(viewer.id), viewer.id, title.id)) return { ok: false, error: "Stai già guardando questo titolo in una serata insieme." };
  const members = await invitable(viewer.id, parsedFriends.data, title.id);
  if (members.length === 0) return { ok: false, error: "Questi amici lo guardano già in un’altra serata insieme." };
  try {
    const group = await repo.createSharedWatch({ titleId: title.id, hostId: viewer.id, memberIds: [viewer.id, ...members] });
    await alignMembers(repo, group, group.memberIds);
    await tellInvited(viewer.displayName, members, title);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("startSharedWatch failed", err);
    return { ok: false, error: "Non siamo riusciti a creare la serata insieme. Riprova." };
  }
}

/** Any member can bring in more of their friends. */
export async function inviteToSharedWatch(groupId: string, ids: string[]): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsedFriends = friendIds.safeParse(ids);
  const repo = getRepository();
  const group = await repo.getSharedWatch(String(groupId).slice(0, 80));
  if (!group || !group.memberIds.includes(viewer.id)) return { ok: false, error: "Serata non trovata." };
  if (!parsedFriends.success) return { ok: false, error: "Scegli almeno un amico." };
  const added = (await invitable(viewer.id, parsedFriends.data, group.titleId)).filter((id) => !group.memberIds.includes(id));
  if (added.length === 0) return { ok: false, error: "Questi amici sono già in una serata insieme per questo titolo." };
  if (group.memberIds.length + added.length > MAX_SHARED_MEMBERS) return { ok: false, error: `Una serata insieme può avere al massimo ${MAX_SHARED_MEMBERS} persone.` };
  const title = (await repo.getTitlesByIds([group.titleId]))[0];
  try {
    const next = { ...group, memberIds: [...group.memberIds, ...added] };
    await repo.updateSharedWatch(group.id, { memberIds: next.memberIds });
    await alignMembers(repo, next, added);
    if (title) await tellInvited(viewer.displayName, added, title);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("inviteToSharedWatch failed", err);
    return { ok: false, error: "Non siamo riusciti ad aggiungere i tuoi amici. Riprova." };
  }
}

/**
 * Leaves the group: the viewer keeps their place in the title, but it no longer
 * moves with the others. With one person left, the group ends.
 */
export async function leaveSharedWatch(groupId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const group = await repo.getSharedWatch(String(groupId).slice(0, 80));
  if (!group || !group.memberIds.includes(viewer.id)) return { ok: false, error: "Serata non trovata." };
  const rest = group.memberIds.filter((id) => id !== viewer.id);
  try {
    if (rest.length < 2) await repo.deleteSharedWatch(group.id);
    else await repo.updateSharedWatch(group.id, { memberIds: rest, ...(group.hostId === viewer.id ? { hostId: rest[0]! } : {}) });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("leaveSharedWatch failed", err);
    return { ok: false, error: "Non siamo riusciti a farti uscire dalla serata. Riprova." };
  }
}

/** The host takes someone out of the night: they keep their place, it just stops moving with the others. */
export async function removeFromSharedWatch(groupId: string, memberId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const group = await repo.getSharedWatch(String(groupId).slice(0, 80));
  if (!group || group.hostId !== viewer.id) return { ok: false, error: "Solo chi ha organizzato la serata può togliere qualcuno." };
  if (memberId === viewer.id || !group.memberIds.includes(memberId)) return { ok: false, error: "Questa persona non è nella serata." };
  const rest = group.memberIds.filter((id) => id !== memberId);
  try {
    if (rest.length < 2) await repo.deleteSharedWatch(group.id);
    else await repo.updateSharedWatch(group.id, { memberIds: rest });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("removeFromSharedWatch failed", err);
    return { ok: false, error: "Non siamo riusciti a togliere questa persona. Riprova." };
  }
}

/**
 * The host ends the night for everyone: the group goes away, each person keeps
 * the place they reached and goes on alone, and the queue can move on.
 */
export async function endSharedWatch(groupId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const group = await repo.getSharedWatch(String(groupId).slice(0, 80));
  if (!group || group.hostId !== viewer.id) return { ok: false, error: "Solo chi ha organizzato la serata può eliminarla." };
  try {
    await repo.deleteSharedWatch(group.id);
    for (const p of await repo.listWatchParties(viewer.id, 100)) {
      if (p.hostId === viewer.id && p.status === "started" && p.pickedTitleId === group.titleId) await repo.setWatchPartyStatus(p.id, "done");
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("endSharedWatch failed", err);
    return { ok: false, error: "Non siamo riusciti a eliminare la serata. Riprova." };
  }
}
