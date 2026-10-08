"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActivityKind, RatingValue } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle as cacheRemoteTitle } from "@/server/services/explore";

/**
 * Mutations for the viewer's own library and wishlist. Each action resolves
 * the viewer from the session (never from arguments) and validates input.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const titleId = z.string().min(1).max(120);

/** Catalog titles are cached on demand, so anything browsable can be saved. */
async function ensureTitle(id: string) {
  return Boolean(await cacheRemoteTitle(id));
}

/** Adds a line to the viewer's activity, which is what friends see on their dashboard. */
async function record(userId: string, kind: ActivityKind, id: string, rating: RatingValue | null = null) {
  await getRepository().recordActivity({ userId, kind, titleId: id, at: new Date().toISOString(), season: null, episode: null, rating });
}

async function run(fn: () => Promise<void>, failure: string): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (err) {
    console.error(failure, err);
    return { ok: false, error: failure };
  }
}

export async function setWishlisted(id: string, wishlisted: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = titleId.safeParse(id);
  if (!parsed.success || !(await ensureTitle(parsed.data))) return { ok: false, error: "Titolo non trovato." };
  return run(async () => {
    if (wishlisted) {
      await getRepository().addToWishlist(user.id, parsed.data);
      await record(user.id, "wishlisted", parsed.data);
    } else await getRepository().removeFromWishlist(user.id, parsed.data);
  }, "Non siamo riusciti ad aggiornare la wishlist.");
}

export async function reorderWishlist(orderedIds: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = z.array(titleId).max(500).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Ordine non valido." };
  return run(() => getRepository().reorderWishlist(user.id, parsed.data), "Non siamo riusciti a salvare il nuovo ordine.");
}

const statusSchema = z.enum(["watching", "completed", "planned", "dropped"]);

export async function setStatus(id: string, status: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success || !(await ensureTitle(parsedId.data))) {
    return { ok: false, error: "Richiesta non valida." };
  }
  return run(async () => {
    const repo = getRepository();
    await repo.setLibraryStatus(user.id, parsedId.data, parsedStatus.data);
    // Starting or finishing a title takes it off the wishlist.
    if (parsedStatus.data === "completed" || parsedStatus.data === "watching") {
      await repo.removeFromWishlist(user.id, parsedId.data);
      await record(user.id, parsedStatus.data, parsedId.data);
    }
  }, "Non siamo riusciti ad aggiornare la libreria.");
}

const ratingSchema = z.number().int().min(1).max(10).nullable();

export async function rateTitle(id: string, value: number | null): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedValue = ratingSchema.safeParse(value);
  if (!parsedId.success || !parsedValue.success || !(await ensureTitle(parsedId.data))) {
    return { ok: false, error: "Voto non valido." };
  }
  const rating = parsedValue.data as RatingValue | null;
  return run(async () => {
    await getRepository().setRating(user.id, parsedId.data, rating);
    if (rating) await record(user.id, "rated", parsedId.data, rating);
  }, "Non siamo riusciti a salvare il voto.");
}
