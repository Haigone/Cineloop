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
    await repo.addFriend(viewer.id, other.id);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("addFriend failed", err);
    return { ok: false, error: "Non siamo riusciti ad aggiungere l'amico. Riprova." };
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
