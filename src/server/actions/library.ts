"use server";

import { getProvider } from "@/domain/providers";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActivityKind, ProviderId, RatingValue, SeasonSummary, TitleUpdates } from "@/domain/types";
import { airedSeasons, finishesEarlierSeason, finishesTitle } from "@/domain/library";
import { fillerRunAfter } from "@/domain/watch-order";
import { italianDay } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle as cacheRemoteTitle } from "@/server/services/explore";
import { shareProgress } from "@/server/services/shared-watch";
import { getCatalog } from "@/integrations/catalog";
import { migrateAnimeTitle } from "@/server/services/anime-migration";
import type { EpisodeInfo } from "@/integrations/catalog/types";

/**
 * Mutations for the viewer's own library and wishlist. Each action resolves
 * the viewer from the session (never from arguments) and validates input.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const titleId = z.string().min(1).max(120);
/** Build AnimeUnity URLs only from a provider ID observed for this exact season and episode. */
async function animeUnityEpisodeUrl(
  storedUrl: string | null | undefined,
  titleName: string,
  titleId: string,
  seasonNumber: number | null,
  episodeNumber: number | null,
): Promise<string | null> {
  const { providerSearchUrl } = await import("@/integrations/providers/search-links");
  const fallback = providerSearchUrl("animeunity", titleName);
  if (seasonNumber === null || episodeNumber === null) return fallback;

  const episodeId = await getRepository().resolveEpisodeExternalId({
    providerId: "animeunity", titleId, seasonNumber, episodeNumber,
  }).catch(() => null);
  if (!episodeId || !/^\d{1,12}$/.test(episodeId)) return fallback;

  let storedPath: string | null = null;
  try {
    const current = storedUrl ? new URL(storedUrl) : null;
    const match = current && /^\/anime\/(\d+-[^/]+)\/(\d+)$/.exec(current.pathname);
    if (current && current.protocol === "https:" &&
      (current.hostname === "animeunity.so" || current.hostname === "www.animeunity.so") && match) {
      storedPath = match[1]!;
    }
  } catch {
    // Invalid/stale stored URL: choose a known safe fallback below.
  }

  const isReZero = /re\s*:?\s*zero/i.test(titleName);
  let slug = storedPath;
  if (isReZero && seasonNumber === 1) {
    // This is the known AnimeUnity page for the 13-episode Director's Cut.
    // The original 2016 cut is kept in a separate mapping namespace (season 101).
    if (!slug || !/shin-henshuu-ban/i.test(slug)) {
      slug = "1973-rezero-kara-hajimeru-isekai-seikatsu-shin-henshuu-ban";
    }
  } else if (isReZero && seasonNumber === 101) {
    // The original 2016 page has its own episode IDs and a stable, known slug.
    // Never combine those IDs with the Director's Cut title path.
    if (!slug || /shin-henshuu-ban/i.test(slug)) {
      slug = "48-rezero-starting-life-in-another-world";
    }
  } else if (!slug) {
    return fallback;
  }
  if (!slug) return fallback;

  return "https://www.animeunity.so/anime/" + slug + "/" + episodeId;
}

/** Build StreamingCommunity URLs only from a verified mapping for the target episode. */
async function streamingCommunityEpisodeUrl(
  storedUrl: string | null | undefined,
  titleName: string,
  titleId: string,
  seasonNumber: number | null,
  episodeNumber: number | null,
  offset: number | null,
): Promise<string | null> {
  const { providerSearchUrl } = await import("@/integrations/providers/search-links");
  const fallback = (origin?: string) => {
    const query = encodeURIComponent(titleName.trim());
    if (origin && query) return `${origin}/search?q=${query}`;
    return providerSearchUrl("streamingcommunity", titleName);
  };
  if (storedUrl) {
    try {
      const current = new URL(storedUrl);
      const host = current.hostname.toLowerCase().replace(/^www\./, "");
      const validHost = /^(?:streaming[-]?community[a-z0-9-]*|streamingcommunityz[a-z0-9-]*)\.[a-z]{2,}$/i.test(host);
      const match = /^\/(?:[a-z]{2}\/)?watch\/(\d{1,9})(?:\/|$)/i.exec(current.pathname);
      if (current.protocol === "https:" && validHost) {
        if (match && offset !== null && seasonNumber !== null && episodeNumber !== null) {
          const episodeId = await getRepository().resolveEpisodeExternalId({
            providerId: "streamingcommunity", titleId, seasonNumber, episodeNumber,
          });
          if (episodeId && /^\d{1,12}$/.test(episodeId)) {
            current.searchParams.set("e", episodeId);
            return current.toString();
          }
        }
        return fallback(current.origin);
      }
    } catch {
      // Invalid or stale URL: use the provider's generic fallback.
    }
  }
  return fallback();
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
    const resolvedId = (await migrateAnimeTitle(parsed.data)) ?? parsed.data;
    if (wishlisted) {
      await getRepository().addToWishlist(user.id, resolvedId);
      await record(user.id, "wishlisted", resolvedId);
    } else await getRepository().removeFromWishlist(user.id, resolvedId);
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


export async function setStatus(id: string, status: string, rezeroVersion?: "directors-cut" | "2016"): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  const parsedReZeroVersion = z.enum(["directors-cut", "2016"]).optional().safeParse(rezeroVersion);
  if (!parsedId.success || !parsedStatus.success || !parsedReZeroVersion.success || !(await ensureTitle(parsedId.data))) {
    return { ok: false, error: "Richiesta non valida." };
  }
  return run(async () => {
    const repo = getRepository();
    const resolvedId = (await migrateAnimeTitle(parsedId.data)) ?? parsedId.data;
    // "Da vedere" no longer exists in the library: a plan goes to the wishlist.
    if (parsedStatus.data === "planned") return repo.addToWishlist(user.id, resolvedId);
    const title = await cacheRemoteTitle(resolvedId);
    const latest = title ? airedSeasons(title, italianDay(), await overridesFor(user.id, resolvedId)).at(-1) : undefined;
    // A series marked as seen is seen up to its latest season: a later one will be "Novità".
    if (parsedStatus.data === "completed" && latest) {
      await repo.markSeenThrough(user.id, resolvedId, latest.number);
      await shareProgress(repo, user.id, resolvedId, "seenThrough");
    } else await repo.setLibraryStatus(user.id, resolvedId, parsedStatus.data);
    // Save the version only after the library row exists.
    if (parsedReZeroVersion.data) {
      const directorsCut = parsedReZeroVersion.data === "directors-cut";
      await repo.setPartOverride(user.id, resolvedId, "rezero-version", directorsCut);
      // Keep the watch-order checkboxes aligned with the version selected on the title page.
      await repo.setPartOverride(user.id, resolvedId, "rezero-directors-cut", directorsCut);
      await repo.setPartOverride(user.id, resolvedId, "rezero-original-2016", !directorsCut);
    }
    // Starting or finishing a title takes it off the wishlist.
    if (parsedStatus.data === "completed" || parsedStatus.data === "watching") {
      await repo.removeFromWishlist(user.id, resolvedId);
      await record(user.id, parsedStatus.data, resolvedId);
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
    const resolvedId = (await migrateAnimeTitle(parsedId.data)) ?? parsedId.data;
    await getRepository().setRating(user.id, resolvedId, rating);
    if (rating) await record(user.id, "rated", resolvedId, rating);
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

const partKey = z.string().min(1).max(40).regex(/^(ann-\d+|filler|rezero-version|rezero-directors-cut|rezero-original-2016)$/);

/** Anime: include or leave out one part of the franchise (or "filler"); null goes back to the default. */
export async function setPartIncluded(id: string, key: string, included: boolean | null): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedKey = partKey.safeParse(key);
  if (!parsedId.success || !parsedKey.success) return { ok: false, error: "Richiesta non valida." };
  return run(async () => {
    const repo = getRepository();
    if (!(await repo.listLibrary(user.id)).some((e) => e.titleId === parsedId.data)) throw new Error("not in library");
    // Enforce Re:Zero's mutually exclusive season-one cuts on the server too,
    // so every UI entry point keeps the watch-order checkboxes synchronized.
    if (included === true && parsedKey.data === "rezero-directors-cut") {
      await repo.setPartOverride(user.id, parsedId.data, "rezero-original-2016", false);
      // This is the canonical preference read by progress detection and AnimeUnity URL selection.
      await repo.setPartOverride(user.id, parsedId.data, "rezero-version", true);
    } else if (included === true && parsedKey.data === "rezero-original-2016") {
      await repo.setPartOverride(user.id, parsedId.data, "rezero-directors-cut", false);
      // Keep the original-cut preference in sync so reloads and progress use the same edition.
      await repo.setPartOverride(user.id, parsedId.data, "rezero-version", false);
    }
    await repo.setPartOverride(user.id, parsedId.data, parsedKey.data, included);
  }, "Non siamo riusciti a salvare la scelta.");
}

/**
 * Saves the Re:ZERO edition as one server action so every control writes the same
 * mutually-exclusive state. null clears both edition flags and the legacy selector.
 */
export async function setReZeroVersion(
  id: string,
  version: "directors-cut" | "2016" | null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsedVersion = z.enum(["directors-cut", "2016"]).nullable().safeParse(version);
  if (!parsedId.success || !parsedVersion.success) return { ok: false, error: "Scelta della versione non valida." };
  return run(async () => {
    const repo = getRepository();
    if (!(await repo.listLibrary(user.id)).some((e) => e.titleId === parsedId.data)) {
      throw new Error("not in library");
    }
    const directorsCut = parsedVersion.data === "directors-cut";
    const original = parsedVersion.data === "2016";
    await repo.setPartOverride(user.id, parsedId.data, "rezero-directors-cut", parsedVersion.data === null ? false : directorsCut);
    await repo.setPartOverride(user.id, parsedId.data, "rezero-original-2016", original);
    await repo.setPartOverride(user.id, parsedId.data, "rezero-version", parsedVersion.data === null ? null : directorsCut);
  }, "Non siamo riusciti a salvare la versione di Re:ZERO.");
}

const updatesSchema = z.enum(["all", "releaseDay", "none"]);

/** The X on Novità ("Non mi interessa più"), then what the user still wants to hear; "all" puts the series back. */
export async function setTitleUpdates(id: string, updates: TitleUpdates): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsedId = titleId.safeParse(id);
  const parsed = updatesSchema.safeParse(updates);
  if (!parsedId.success || !parsed.success) return { ok: false, error: "Richiesta non valida." };
  return run(async () => {
    const repo = getRepository();
    if (!(await repo.listLibrary(user.id)).some((e) => e.titleId === parsedId.data)) throw new Error("not in library");
    await repo.setUpdates(user.id, parsedId.data, parsed.data);
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
  const resolvedId = parsedId.success ? ((await migrateAnimeTitle(parsedId.data)) ?? parsedId.data) : null;
  const title = resolvedId ? await cacheRemoteTitle(resolvedId) : null;
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
    // The catalogue's canonical season count follows the 13-episode Director's Cut.
    // The original 2016 cut has 25 episodes, while retaining season 1 for progress.
    const reZeroOverrides = (await overridesFor(user.id, title.id) ?? {});
    const explicitlyOriginal = reZeroOverrides["rezero-original-2016"] === true;
    const explicitlyDirectorsCut = reZeroOverrides["rezero-directors-cut"] === true;
    const reZeroOriginal = /re\s*:?\s*zero/i.test(title.title) && season === 1 &&
      (explicitlyOriginal || (!explicitlyDirectorsCut && Object.is(reZeroOverrides["rezero-version"], false)));
    const episodeCount = reZeroOriginal ? 25 : (s?.episodeCount ?? 0);
    // When the catalogue does not list the seasons, any season and episode will do.
    const known = title.seasons.length > 0;
    if (season === null || episode === null || (known && (!s || episode > episodeCount))) {
      return { ok: false, error: "Scegli una stagione e un episodio che esistono." };
    }
  }
  const runtime = (title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes) || 1;
  const progressOverrides = (await overridesFor(user.id, title.id)) ?? {};
  const progressExplicitlyOriginal = progressOverrides["rezero-original-2016"] === true;
  const progressExplicitlyDirectorsCut = progressOverrides["rezero-directors-cut"] === true;
  const progressUsesOriginal = progressExplicitlyOriginal || (!progressExplicitlyDirectorsCut && Object.is(progressOverrides["rezero-version"], false));
  const progressTitle = title.type !== "movie" && /re\s*:?\s*zero/i.test(title.title) && season === 1 && progressUsesOriginal
    ? { ...title, seasons: title.seasons.map((s) => s.number === 1 ? { ...s, episodeCount: 25 } : s) }
    : title;
  // At the end of the last episode (or of the film): seen, and Home asks for a rating.
  if (runtime > 1 && finishesTitle(progressTitle, { season, episode, fraction: minute / runtime }, italianDay(), progressOverrides)) {
    return run(async () => {
      const repo = getRepository();
      await repo.markFinished(user.id, title.id, season);
      await shareProgress(repo, user.id, title.id, "finished");
      await repo.removeFromWishlist(user.id, title.id);
      await record(user.id, "completed", title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  // At the end of a season while a later one has already aired: seen up to there, the next season is "Novità".
  if (runtime > 1 && finishesEarlierSeason(progressTitle, { season, episode, fraction: minute / runtime }, italianDay(), progressOverrides)) {
    return run(async () => {
      const repo = getRepository();
      await repo.markSeenThrough(user.id, title.id, season!);
      await shareProgress(repo, user.id, title.id, "seenThrough");
      await repo.removeFromWishlist(user.id, title.id);
    }, "Non siamo riusciti a salvare dove sei arrivato.");
  }
  return run(async () => {
    const repo = getRepository();
    const entry = (await repo.listLibrary(user.id)).find((e) => e.titleId === title.id);
    const prev = entry?.progress ?? null;
    const nextProvider = chosenProvider === undefined ? (prev?.providerId ?? null) : (chosenProvider as ProviderId | null);
    const sameEpisode = prev?.season === season && prev?.episode === episode;
    const previousPath = (() => {
      try { return prev?.url ? new URL(prev.url).pathname : ""; } catch { return ""; }
    })();
    const isReZeroSeasonOne = /re\s*:?\s*zero/i.test(title.title) && season === 1;
    const selectedDirectorCut = entry?.partOverrides?.["rezero-directors-cut"] === true ||
      (entry?.partOverrides?.["rezero-original-2016"] !== true && entry?.partOverrides?.["rezero-directors-cut"] !== false &&
        entry?.partOverrides?.["rezero-version"] !== false);
    const previousIsEpisodePath = /^\/anime\/\d+-[^/]+\/\d+$/.test(previousPath);
    const previousPathMatchesCut = !isReZeroSeasonOne ||
      (previousIsEpisodePath && (selectedDirectorCut ? /shin-henshuu-ban/i.test(previousPath) : !/shin-henshuu-ban/i.test(previousPath)));
    const keepPreviousEpisodeUrl = sameEpisode && (chosenProvider === undefined || chosenProvider === prev?.providerId) &&
      (nextProvider !== "animeunity" || previousPathMatchesCut);
    let nextUrl: string | null = keepPreviousEpisodeUrl ? (prev?.url ?? null) : null;
    const sameSeason = prev?.season === season;
    const offset = sameSeason && prev?.episode !== null && prev?.episode !== undefined && episode !== null
      ? episode - prev.episode
      : null;
    if (nextProvider === "animeunity") {
      nextUrl = keepPreviousEpisodeUrl && prev?.url
        ? prev.url
        : await animeUnityEpisodeUrl(
            prev?.url,
            title.title,
            title.id,
            title.title.match(/re\s*:?\s*zero/i) && season === 1 && entry?.partOverrides?.["rezero-version"] === false ? 101 : season,
            episode,
          );
    } else if (nextProvider === "streamingcommunity" && title.type === "series") {
      nextUrl = sameEpisode && prev?.url
        ? prev.url
        : await streamingCommunityEpisodeUrl(prev?.url, title.title, title.id, season, episode, offset);
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
  const resolvedId = parsedId.success ? ((await migrateAnimeTitle(parsedId.data)) ?? parsedId.data) : null;
  const title = resolvedId ? await cacheRemoteTitle(resolvedId) : null;
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
  // Preserve provider-specific episode URLs when skipping fillers.
  let nextUrl: string | null = null;
  const offset = progress.season === runAhead.season && progress.episode !== null
    ? runAhead.after - progress.episode
    : null;
  if (progress.providerId === "animeunity") {
    nextUrl = await animeUnityEpisodeUrl(progress.url, title.title, title.id, runAhead.season, runAhead.after);
  } else if (progress.providerId === "streamingcommunity" && title.type === "series") {
    nextUrl = await streamingCommunityEpisodeUrl(progress.url, title.title, title.id, runAhead.season, runAhead.after, offset);
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
