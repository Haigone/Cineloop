"use server";

import { getProvider } from "@/domain/providers";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActivityKind, ProviderId, RatingValue, SeasonSummary } from "@/domain/types";
import { airedSeasons, finishesEarlierSeason, finishesTitle } from "@/domain/library";
import { fillerRunAfter } from "@/domain/watch-order";
import { italianDay } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle as cacheRemoteTitle } from "@/server/services/explore";
import { shareProgress } from "@/server/services/shared-watch";
import { getCatalog } from "@/integrations/catalog";
import type { EpisodeInfo } from "@/integrations/catalog/types";

/**
 * Mutations for the viewer's own library and wishlist. Each action resolves
 * the viewer from the session (never from arguments) and validates input.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const titleId = z.string().min(1).max(120);
/** Resolve a saved AnimeUnity episode URL after changing the episode manually.
 * Episode IDs are advanced only within the same season; otherwise use archive search.
 */
async function animeUnityEpisodeUrl(
  storedUrl: string | null | undefined,
  titleName: string,
  offset: number | null,
): Promise<string | null> {
  const { providerSearchUrl } = await import("@/integrations/providers/search-links");
  const fallback = providerSearchUrl("animeunity", titleName);
  if (storedUrl && offset !== null) {
    try {
      const current = new URL(storedUrl);
      const match = /^\/anime\/(\d+-[^/]+)\/(\d+)$/.exec(current.pathname);
      if (
        current.protocol === "https:" &&
        (current.hostname === "animeunity.so" || current.hostname === "www.animeunity.so") &&
        match
      ) {
        // Episode IDs move in both directions when the viewer edits progress.
        const nextEpisodeId = Number(match[2]) + offset;
        if (Number.isSafeInteger(nextEpisodeId) && nextEpisodeId > 0) {
          current.pathname = `/anime/${match[1]}/${nextEpisodeId}`;
          current.search = "";
          current.hash = "";
          return current.toString();
        }
      }
    } catch {
      // Invalid/stale stored URL: use the archive fallback.
    }
  }
  return fallback;
}


/** Catalog titles are cached on demand, so anything browsable can be saved. */
async function ensureTitle(id: string) {
  return Boolean(await cacheRemoteTitle(id));
}

/** The parts of an anime the viewer left in or out, for deciding when it is finished. */
async function overridesFor(userId: string, id: string) {
  return (await getRepository().listLibrary(userId)).find((e) => e.titleId === id)?.partOverrides;
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
    const latest = title ? airedSeasons(title, italianDay(), await overridesFor(user.id, parsedId.data)).at(-1) : undefined;
    // A series marked as seen is seen up to its latest season: a later one will be "Novità".
    if (parsedStatus.data === "completed" && latest) {
      await repo.markSeenThrough(user.id, parsedId.data, latest.number);
      await shareProgress(repo, user.id, parsedId.data, "seenThrough");
    } else await repo.setLibraryStatus(user.id, parsedId.data, parsedStatus.data);
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

/** Library card menu: takes the title out of the library, progress and rating included. */
export async function removeFromLibrary(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Richiesta non valida." };
  return run(() => getRepository().removeFromLibrary(user.id, parsedId.data), "Non siamo riusciti a rimuovere il titolo.");
}

/**
 * "I am not watching this": takes a title out of "In corso" (progress and rating go with it), either
 * back to the wishlist or out of the library altogether. Only for what is being watched.
 */
export async function stopWatching(id: string, destination: "wishlist" | "remove"): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  if (!parsedId.success || (destination !== "wishlist" && destination !== "remove")) return { ok: false, error: "Richiesta non valida." };
  const repo = getRepository();
  const entry = (await repo.listLibrary(user.id)).find((e) => e.titleId === parsedId.data);
  if (!entry || entry.status !== "watching") return { ok: false, error: "Questo titolo non è in corso." };
  return run(async () => {
    await repo.removeFromLibrary(user.id, parsedId.data);
    if (destination === "wishlist") await repo.addToWishlist(user.id, parsedId.data);
  }, "Non siamo riusciti a togliere il titolo da In corso.");
}

/** Library card menu: seen to the end (a series up to its latest season out), then Home asks for a rating. */
export async function finishTitle(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const title = parsedId.success ? await cacheRemoteTitle(parsedId.data) : null;
  if (!title) return { ok: false, error: "Richiesta non valida." };
  return run(async () => {
    const repo = getRepository();
    await repo.markFinished(user.id, title.id, title.type === "movie" ? null : (airedSeasons(title, italianDay(), await overridesFor(user.id, title.id)).at(-1)?.number ?? null));
    await shareProgress(repo, user.id, title.id, "finished");
    await repo.removeFromWishlist(user.id, title.id);
    await record(user.id, "completed", title.id);
  }, "Non siamo riusciti a segnarlo come visto.");
}

const partKey = z.string().min(1).max(40).regex(/^(ann-\d+|filler)$/);

/** Anime: include or leave out one part of the franchise (or "filler"); null goes back to the default. */
export async function setPartIncluded(id: string, key: string, included: boolean | null): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedKey = partKey.safeParse(key);
  if (!parsedId.success || !parsedKey.success) return { ok: false, error: "Richiesta non valida." };
  return run(async () => {
    const repo = getRepository();
    if (!(await repo.listLibrary(user.id)).some((e) => e.titleId === parsedId.data)) throw new Error("not in library");
    await repo.setPartOverride(user.id, parsedId.data, parsedKey.data, included);
  }, "Non siamo riusciti a salvare la scelta.");
}

/** "Non ora" on Home's rating prompt. */
export async function dismissRatingPrompt(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Richiesta non valida." };
  return run(() => getRepository().dismissRatingPrompt(user.id, parsedId.data), "Non siamo riusciti a salvare la scelta.");
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
  /** Where it is watched; undefined leaves the saved service as it is, null clears it. */
  providerId: z.string().max(40).nullable().optional(),
});

/**
 * The viewer says where they are in a title they watch somewhere CineLoop
 * cannot follow (TV, cinema, another service): season, episode and minute.
 */
export async function saveManualProgress(
  id: string,
  input: { season: number | null; episode: number | null; minute: number; finished?: boolean; providerId?: string | null },
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
      await shareProgress(repo, user.id, title.id, "seenThrough");
      await repo.removeFromWishlist(user.id, title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  const { minute } = parsed.data;
  let { season, episode } = parsed.data;
  const chosenProvider = parsed.data.providerId;
  // Any known service can be chosen by hand, except the two this app does not link to.
  if (chosenProvider && (!getProvider(chosenProvider as never) || chosenProvider === "animeunity" || chosenProvider === "streamingcommunity")) {
    return { ok: false, error: "Servizio non valido per questo titolo." };
  }
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
  // At the end of the last episode (or of the film): seen, and Home asks for a rating.
  if (runtime > 1 && finishesTitle(title, { season, episode, fraction: minute / runtime }, italianDay(), await overridesFor(user.id, title.id))) {
    return run(async () => {
      const repo = getRepository();
      await repo.markFinished(user.id, title.id, season);
      await shareProgress(repo, user.id, title.id, "finished");
      await repo.removeFromWishlist(user.id, title.id);
      await record(user.id, "completed", title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  // At the end of a season while a later one has already aired: seen up to there, the next season is "Novità".
  if (runtime > 1 && finishesEarlierSeason(title, { season, episode, fraction: minute / runtime }, italianDay(), await overridesFor(user.id, title.id))) {
    return run(async () => {
      const repo = getRepository();
      await repo.markSeenThrough(user.id, title.id, season!);
      await shareProgress(repo, user.id, title.id, "seenThrough");
      await repo.removeFromWishlist(user.id, title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  return run(async () => {
    const repo = getRepository();
    const prev = (await repo.listLibrary(user.id)).find((e) => e.titleId === title.id)?.progress ?? null;
    const nextProvider = chosenProvider === undefined ? (prev?.providerId ?? null) : (chosenProvider as ProviderId | null);
    const sameEpisode = prev?.season === season && prev?.episode === episode;
    let nextUrl: string | null = sameEpisode && (chosenProvider === undefined || chosenProvider === prev?.providerId)
      ? (prev?.url ?? null)
      : null;
    if (nextProvider === "animeunity") {
      const sameSeason = prev?.season === season;
      const offset = sameSeason && prev?.episode !== null && prev?.episode !== undefined && episode !== null
        ? episode - prev.episode
        : null;
      nextUrl = sameEpisode && prev?.url
        ? prev.url
        : await animeUnityEpisodeUrl(prev?.url, title.title, offset);
    }
    await repo.saveProgress(user.id, {
      titleId: title.id,
      providerId: nextProvider,
      season,
      episode,
      fraction: Math.min(0.99, minute / runtime),
      // For AnimeUnity, retain the title path and advance its episode ID when possible;
      // otherwise save the archive search URL instead of clearing the destination.
      url: nextUrl,
      updatedAt: new Date().toISOString(),
    });
    await shareProgress(repo, user.id, title.id);
    await repo.removeFromWishlist(user.id, title.id);
    await repo.recordActivity({ userId: user.id, kind: "watching", titleId: title.id, at: new Date().toISOString(), season, episode, rating: null });
  }, "Non siamo riusciti a salvare dove sei arrivato.");
}

/** The user chooses a service on the title page before playback detection arrives. */
export async function chooseWatchProvider(id: string, providerId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedProvider = z.enum(["netflix", "animeunity"]).safeParse(providerId);
  const title = parsedId.success ? await cacheRemoteTitle(parsedId.data) : null;
  if (!parsedId.success || !parsedProvider.success || !title) {
    return { ok: false, error: "Scelta del servizio non valida." };
  }
  if (parsedProvider.data === "animeunity" && title.type !== "anime" && !("partOf" in title && title.partOf)) {
    return { ok: false, error: "Anime Unity è disponibile solo per i titoli anime." };
  }
  const { providerSearchUrl } = await import("@/integrations/providers/search-links");
  const searchUrl = providerSearchUrl(parsedProvider.data, title.title);
  if (!searchUrl) return { ok: false, error: "Non è disponibile un link di ricerca per questo servizio." };

  return run(async () => {
    const repo = getRepository();
    const entry = (await repo.listLibrary(user.id)).find((e) => e.titleId === title.id);
    const previous = entry?.progress ?? null;
    const now = new Date().toISOString();
    await repo.setLibraryStatus(user.id, title.id, "watching");
    await repo.removeFromWishlist(user.id, title.id);
    await repo.saveProgress(user.id, {
      titleId: title.id,
      providerId: parsedProvider.data,
      season: previous?.season ?? null,
      episode: previous?.episode ?? null,
      fraction: previous?.fraction ?? 0,
      // Keep a previously observed page only when the provider is unchanged.
      // Otherwise point to a provider-side search until the extension reports the exact page.
      url: previous?.providerId === parsedProvider.data && previous.url ? previous.url : searchUrl,
      updatedAt: now,
    });
    await repo.recordActivity({ userId: user.id, kind: "watching", titleId: title.id, at: now, season: previous?.season ?? null, episode: previous?.episode ?? null, rating: null });
  }, "Non siamo riusciti a salvare il servizio scelto.");
}

const podiumSchema = z.object({ category: z.enum(["movie", "series", "anime"]), ids: z.array(titleId).max(3) });

/** The viewer's top 3 of one category for Classifiche, first place first. Only titles of that category they have watched. */
export async function savePodium(category: string, ids: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = podiumSchema.safeParse({ category, ids });
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) return { ok: false, error: "Podio non valido." };
  const repo = getRepository();
  const [library, titles] = await Promise.all([repo.listLibrary(user.id), repo.listTitles()]);
  const kind = new Map(titles.map((t) => [t.id, t.type]));
  const watched = new Set(library.filter((e) => e.status === "completed" || e.status === "watching").map((e) => e.titleId));
  if (!parsed.data.ids.every((id) => watched.has(id) && kind.get(id) === parsed.data.category)) return { ok: false, error: "Sul podio vanno solo titoli di questa categoria che hai visto." };
  return run(async () => {
    const prefs = await repo.getPreferences(user.id);
    await repo.updatePreferences(user.id, { podiums: { ...prefs.podiums, [parsed.data.category]: parsed.data.ids } });
  }, "Non siamo riusciti a salvare il podio.");
}


/** Moves the viewer past the filler episodes coming up: their place becomes the first episode after them. */
export async function skipFillers(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = titleId.safeParse(id);
  const title = parsed.success ? await cacheRemoteTitle(parsed.data) : null;
  if (!parsed.success || !title) return { ok: false, error: "Titolo non trovato." };
  const repo = getRepository();
  const entry = (await repo.listLibrary(user.id)).find((e) => e.titleId === title.id);
  const progress = entry?.progress;
  // Worked out again here from the title's own data, never taken from the page.
  const runAhead = progress ? fillerRunAfter(title, progress, entry?.partOverrides) : null;
  if (!progress || !runAhead || runAhead.after === null) return { ok: false, error: "Non ci sono filler da saltare." };
  // Keep AnimeUnity's title slug and advance its numeric episode ID by the
  // number of episodes skipped. If the observed URL is not a canonical episode
  // page (or the episode offset is unknown), fall back to the title archive search.
  let nextUrl: string | null = null;
  if (progress.providerId === "animeunity") {
    const offset = progress.season === runAhead.season && progress.episode !== null
      ? runAhead.after - progress.episode
      : null;
    nextUrl = await animeUnityEpisodeUrl(progress.url, title.title, offset);
  }
  return run(async () => {
    await repo.saveProgress(user.id, {
      titleId: title.id,
      providerId: progress.providerId,
      season: runAhead.season,
      episode: runAhead.after!,
      fraction: 0,
      url: nextUrl,
      updatedAt: new Date().toISOString(),
    });
    await shareProgress(repo, user.id, title.id);
    await repo.recordActivity({ userId: user.id, kind: "watching", titleId: title.id, at: new Date().toISOString(), season: runAhead.season, episode: runAhead.after, rating: null });
  }, "Non siamo riusciti a saltare i filler.");
}
