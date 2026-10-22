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
    if (!other || other.id === viewer.id) return { ok: false, error: \`Nessun utente con username @\${parsed.data}.\` };
    const existing = await repo.listFriendRequests(viewer.id);
    if ((await repo.listFriends(viewer.id)).some((f) => f.user.id === other.id)) return { ok: false, error: "Siete già amici." };
    const incoming = existing.find((r) => r.fromUserId === other.id && r.toUserId === viewer.id && r.status === "pending");
    if (incoming) return { ok: false, error: "Hai già ricevuto una richiesta da questo utente: accettala o rifiutala dalla sezione Amici." };
    const request = await repo.createFriendRequest(viewer.id, other.id);
    if (request.status === "rejected") return { ok: false, error: "La richiesta precedente è stata rifiutata e non può essere duplicata." };
    if (request.status === "pending") {
      await repo.createNotification({ userId: other.id, kind: "system", message: \`\${viewer.displayName} ti ha inviato una richiesta di amicizia.\`, href: "/friends", at: new Date().toISOString() });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("addFriend failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Non siamo riusciti a inviare la richiesta. Riprova." };
  }
}

export async function respondFriendRequest(requestId: string, status: "accepted" | "rejected"): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  if (!z.string().min(1).max(120).safeParse(requestId).success || !["accepted", "rejected"].includes(status)) {
    return { ok: false, error: "Richiesta non valida." };
  }
  try {
    const repo = getRepository();
    const changed = await repo.respondFriendRequest(requestId, viewer.id, status);
    if (!changed) return { ok: false, error: "La richiesta non è più in attesa o non è destinata a te." };
    const request = (await repo.listFriendRequests(viewer.id)).find((r) => r.id === requestId);
    if (request) {
      const sender = await repo.getUserById(request.fromUserId);
      if (sender) await repo.createNotification({
        userId: sender.id, kind: "system",
        message: status === "accepted" ? \`\${viewer.displayName} ha accettato la tua richiesta di amicizia.\` : \`\${viewer.displayName} ha rifiutato la tua richiesta di amicizia.\`,
        href: "/friends", at: new Date().toISOString(),
      });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("respondFriendRequest failed", err);
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
