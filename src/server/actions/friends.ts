"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import type { ActionResult } from "./library";

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/);

export async function addFriend(rawUsername: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return { ok: false, error: "Username non valido." };
  try {
    const repo = getRepository();
    const other = await repo.getUserByUsername(parsed.data);
    if (!other || other.id === viewer.id) return { ok: false, error: `Nessun utente con username @${parsed.data}.` };
    if ((await repo.listFriends(viewer.id)).some((friend) => friend.user.id === other.id)) {
      return { ok: false, error: `@${parsed.data} è già tra i tuoi amici.` };
    }
    if ((await repo.listFriendRequests(viewer.id)).some((request) => request.user.id === other.id)) {
      return { ok: false, error: `@${parsed.data} ti ha già inviato una richiesta: puoi accettarla qui.` };
    }
    const created = await repo.createFriendRequest(viewer.id, other.id);
    if (!created) return { ok: false, error: "Hai già inviato una richiesta a questo utente." };
    await repo.createNotification({
      userId: other.id,
      kind: "system",
      message: `@${viewer.username} ti ha inviato una richiesta di amicizia.`,
      href: "/friends",
      at: new Date().toISOString(),
    });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("friend request failed", err);
    return { ok: false, error: "Non siamo riusciti a inviare la richiesta. Riprova." };
  }
}

/** The recipient alone can accept or decline an incoming request. */
export async function respondToFriendRequest(requesterId: string, accept: boolean): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  if (!z.string().min(1).max(80).safeParse(requesterId).success || typeof accept !== "boolean") {
    return { ok: false, error: "Richiesta non valida." };
  }
  try {
    const repo = getRepository();
    const request = (await repo.listFriendRequests(viewer.id)).find((item) => item.user.id === requesterId);
    if (!request) return { ok: false, error: "Questa richiesta non è più disponibile." };
    const changed = await repo.respondFriendRequest(viewer.id, requesterId, accept);
    if (!changed) return { ok: false, error: "Questa richiesta non è più disponibile." };
    if (accept) {
      await repo.createNotification({
        userId: requesterId,
        kind: "system",
        message: `@${viewer.username} ha accettato la tua richiesta di amicizia.`,
        href: "/friends",
        at: new Date().toISOString(),
      });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("responding to a friend request failed", err);
    return { ok: false, error: "Non siamo riusciti ad aggiornare la richiesta. Riprova." };
  }
}

export async function removeFriend(friendId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  if (!z.string().min(1).max(80).safeParse(friendId).success) return { ok: false, error: "Richiesta non valida." };
  try {
    await getRepository().removeFriend(viewer.id, friendId);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("removeFriend failed", err);
    return { ok: false, error: "Non siamo riusciti a rimuovere l'amico. Riprova." };
  }
}
