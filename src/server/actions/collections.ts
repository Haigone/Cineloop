"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { COLLECTION_FOLLOW_MARKER } from "@/domain/collections";
import type { ActionResult } from "./library";

/**
 * The viewer's watching order for a saga and the films they leave out. The
 * choice is theirs alone and can be made before watching anything.
 */

const collectionId = z.string().regex(/^(tmdb-collection-\d{1,12}|demo-collection-[a-z0-9-]{1,40})$/);
const filmId = z.string().min(1).max(120);
const order = z.array(filmId).max(80);

async function update(id: string, change: (c: { order: string[]; excluded: string[] }) => { order: string[]; excluded: string[] }): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = collectionId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Richiesta non valida." };
  try {
    const repo = getRepository();
    const current = (await repo.listCollectionChoices(user.id)).find((c) => c.collectionId === parsed.data) ?? { order: [], excluded: [] };
    const next = change({ order: [...current.order], excluded: [...current.excluded] });
    await repo.saveCollectionChoice(user.id, { collectionId: parsed.data, ...next });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("saving a saga choice failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare la scelta." };
  }
}

/** Includes a film of the saga, or leaves it out. */
export async function setSagaFilmIncluded(id: string, film: string, included: boolean): Promise<ActionResult> {
  const parsedFilm = filmId.safeParse(film);
  if (!parsedFilm.success) return { ok: false, error: "Richiesta non valida." };
  return update(id, (c) => ({
    order: c.order,
    excluded: included ? c.excluded.filter((x) => x !== parsedFilm.data) : [...new Set([...c.excluded, parsedFilm.data])],
  }));
}

/** The viewer's own order of the saga's films; null goes back to release order. */
export async function setSagaOrder(id: string, films: string[] | null): Promise<ActionResult> {
  const parsedOrder = films === null ? { success: true as const, data: [] } : order.safeParse(films);
  if (!parsedOrder.success) return { ok: false, error: "Richiesta non valida." };
  return update(id, (c) => ({ order: [...new Set(parsedOrder.data)], excluded: c.excluded }));
}


/** Adds/removes a saga or collection from the viewer's personal library. */
export async function setCollectionFollowed(id: string, followed: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = collectionId.safeParse(id);
  if (!parsed.success || typeof followed !== "boolean") return { ok: false, error: "Collezione non valida." };
  try {
    const repo = getRepository();
    const current = (await repo.listCollectionChoices(user.id)).find((choice) => choice.collectionId === parsed.data) ?? { order: [], excluded: [] };
    const excluded = followed ? [...new Set([...current.excluded, COLLECTION_FOLLOW_MARKER])] : current.excluded.filter((value) => value !== COLLECTION_FOLLOW_MARKER);
    await repo.saveCollectionChoice(user.id, { collectionId: parsed.data, order: current.order, excluded });
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("saving collection follow state failed", error);
    return { ok: false, error: "Non siamo riusciti ad aggiornare la tua libreria." };
  }
}
