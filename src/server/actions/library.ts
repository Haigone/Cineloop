"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActivityKind, RatingValue, SeasonSummary } from "@/domain/types";
import { airedSeasons } from "@/domain/library";
import { italianDay } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle as cacheRemoteTitle } from "@/server/services/explore";
import { getCatalog } from "@/integrations/catalog";
import type { EpisodeInfo } from "@/integrations/catalog/types";

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
  return run(async () => {
    const repo = getRepository();
    // Home reorders one section at a time: its titles swap among the places they hold, the rest stay put.
    const full = (await repo.listWishlist(user.id)).map((w) => w.titleId);
    const moved = new Set(parsed.data);
    const queue = [...moved].filter((id) => full.includes(id));
    const merged = full.map((id) => (moved.has(id) ? queue.shift()! : id));
    await repo.reorderWishlist(user.id, merged);
  }, "Non siamo riusciti a salvare il nuovo ordine.");
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
    // "Da vedere" no longer exists in the library: a plan goes to the wishlist.
    if (parsedStatus.data === "planned") return repo.addToWishlist(user.id, parsedId.data);
    const title = await cacheRemoteTitle(parsedId.data);
    const latest = title ? airedSeasons(title, italianDay()).at(-1) : undefined;
    // A series marked as seen is seen up to its latest season: a later one will be "Novità".
    if (parsedStatus.data === "completed" && latest) await repo.markSeenThrough(user.id, parsedId.data, latest.number);
    else await repo.setLibraryStatus(user.id, parsedId.data, parsedStatus.data);
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

/** A series' seasons from the catalogue, fetched now if they were not known yet. */
export async function loadSeasons(id: string): Promise<SeasonSummary[]> {
  await getCurrentUser();
  const parsed = titleId.safeParse(id);
  const title = parsed.success ? await cacheRemoteTitle(parsed.data) : null;
  return title && title.type !== "movie" ? title.seasons : [];
}

/** A season's episodes for the title page, from the catalogue. */
export async function loadEpisodes(id: string, season: number): Promise<EpisodeInfo[] | null> {
  await getCurrentUser();
  const parsed = titleId.safeParse(id);
  if (!parsed.success || !Number.isInteger(season) || season < 0 || season > 200) return null;
  return getCatalog()
    .episodes(parsed.data, season)
    .catch(() => null);
}

const manualProgressSchema = z.object({
  season: z.number().int().min(0).max(200).nullable(),
  episode: z.number().int().min(1).max(5000).nullable(),
  minute: z.number().int().min(0).max(1000),
  finished: z.boolean().optional(),
});

/**
 * The viewer says where they are in a title they watch somewhere CineLoop
 * cannot follow (TV, cinema, another service): season, episode and minute.
 */
export async function saveManualProgress(
  id: string,
  input: { season: number | null; episode: number | null; minute: number; finished?: boolean },
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsed = manualProgressSchema.safeParse(input);
  const title = parsedId.success ? await cacheRemoteTitle(parsedId.data) : null;
  if (!parsedId.success || !parsed.success || !title) return { ok: false, error: "Dati non validi." };
  // "I had finished it, waiting for the next season": seen up to the end of that season.
  if (parsed.data.finished && title.type !== "movie") {
    const season = parsed.data.season;
    if (season === null || (title.seasons.length > 0 && !title.seasons.some((s) => s.number === season))) {
      return { ok: false, error: "Scegli una stagione che esiste." };
    }
    return run(async () => {
      const repo = getRepository();
      await repo.markSeenThrough(user.id, title.id, season);
      await repo.removeFromWishlist(user.id, title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  const { minute } = parsed.data;
  let { season, episode } = parsed.data;
  if (title.type === "movie") {
    season = null;
    episode = null;
  } else {
    const s = title.seasons.find((x) => x.number === season);
    // When the catalogue does not list the seasons, any season and episode will do.
    const known = title.seasons.length > 0;
    if (season === null || episode === null || (known && (!s || episode > s.episodeCount))) {
      return { ok: false, error: "Scegli una stagione e un episodio che esistono." };
    }
  }
  const runtime = (title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes) || 1;
  return run(async () => {
    const repo = getRepository();
    const prev = (await repo.listLibrary(user.id)).find((e) => e.titleId === title.id)?.progress ?? null;
    const sameEpisode = prev?.season === season && prev?.episode === episode;
    await repo.saveProgress(user.id, {
      titleId: title.id,
      providerId: prev?.providerId ?? null,
      season,
      episode,
      fraction: Math.min(0.99, minute / runtime),
      // A link to another episode would open the wrong one.
      url: sameEpisode ? (prev?.url ?? null) : null,
      updatedAt: new Date().toISOString(),
    });
    await repo.removeFromWishlist(user.id, title.id);
    await repo.recordActivity({ userId: user.id, kind: "watching", titleId: title.id, at: new Date().toISOString(), season, episode, rating: null });
  }, "Non siamo riusciti a salvare dove sei arrivato.");
}

const podiumSchema = z.array(titleId).max(3);

/** The viewer's top 3 for Classifiche, first place first. Only titles they have watched. */
export async function savePodium(ids: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = podiumSchema.safeParse(ids);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) return { ok: false, error: "Podio non valido." };
  const repo = getRepository();
  const watched = new Set((await repo.listLibrary(user.id)).filter((e) => e.status === "completed" || e.status === "watching").map((e) => e.titleId));
  if (!parsed.data.every((id) => watched.has(id))) return { ok: false, error: "Sul podio vanno solo titoli che hai visto." };
  return run(async () => {
    await repo.updatePreferences(user.id, { podium: parsed.data });
  }, "Non siamo riusciti a salvare il podio.");
}
