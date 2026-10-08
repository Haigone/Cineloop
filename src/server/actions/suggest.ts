"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "@/server/services/explore";
import type { ActionResult } from "./library";

const schema = z.object({
  titleId: z.string().min(1).max(120),
  friendIds: z.array(z.string().min(1).max(80)).min(1).max(20),
});

/**
 * Puts a title on a friend's wishlist, marked as coming from the viewer, and
 * tells them. Only friends can be suggested to, so this cannot be used to
 * push titles at strangers.
 */
export async function suggestTitle(titleId: string, friendIds: string[]): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = schema.safeParse({ titleId, friendIds });
  if (!parsed.success) return { ok: false, error: "Richiesta non valida." };

  try {
    const repo = getRepository();
    const title = await ensureTitle(parsed.data.titleId);
    if (!title) return { ok: false, error: "Titolo non trovato." };

    const friends = new Set((await repo.listFriends(viewer.id)).map((f) => f.user.id));
    const targets = parsed.data.friendIds.filter((id) => friends.has(id));
    if (targets.length === 0) return { ok: false, error: "Puoi consigliare un titolo solo ai tuoi amici." };

    for (const friendId of targets) {
      const already = await repo.listWishlist(friendId);
      if (!already.some((w) => w.titleId === title.id)) {
        await repo.addToWishlist(friendId, title.id, viewer.id);
      }
      if (!(await repo.getPreferences(friendId)).notifySuggestions) continue;
      await repo.createNotification({
        userId: friendId,
        kind: "suggestion",
        message: `${viewer.displayName} ti ha consigliato ${title.title}.`,
        href: `/title/${title.id}`,
        at: new Date().toISOString(),
      });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("suggestTitle failed", err);
    return { ok: false, error: "Non siamo riusciti a inviare il consiglio. Riprova." };
  }
}
