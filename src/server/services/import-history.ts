import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { searchKey } from "@/lib/text";
import { getRepository } from "@/server/data";
import { asFranchise } from "./anime-migration";
import { cacheTitles } from "./explore";
import { matchWithin, nameKey, ownedNames } from "./import-list";

/**
 * One title from the user's Netflix viewing history, already grouped by the
 * extension: a series with the highest season seen, or a film. The CSV itself
 * never reaches the server.
 */
export interface HistoryItem {
  /** The series name, or the film's whole title. */
  title: string;
  /** "series": the history named a season. "unknown": "Name: something", series or film. */
  kind: "series" | "film" | "unknown";
  season?: number;
  /** The row as Netflix wrote it, for the error log. */
  sample: string;
  /** Days it was watched, as the history dates them (one per day and season). */
  watched?: { d: string; s?: number; n?: number }[];
}

export interface HistoryResult {
  added: string[];
  /** Plays recorded (episodes and films with a date, for new and already-owned titles). */
  days: number;
  /** Already in the library: left as they are. */
  already: number;
  notFound: { title: string; sample: string }[];
  /** Not looked at for lack of time: the extension sends them again. Only with a time budget. */
  pending?: HistoryItem[];
}

/**
 * Adds what the user watched on Netflix and is not yet in the library: a film
 * as seen, a series as seen through the highest season in the history (a later
 * season then shows as "Novità"). Titles already in the library are left alone;
 * the ones now in the library leave the wishlist, as when the extension sees them played.
 */
export async function importNetflixHistory(userId: string, items: readonly HistoryItem[], budgetMs?: number): Promise<HistoryResult> {
  const repo = getRepository();
  const [library, wishlist] = await Promise.all([repo.listLibrary(userId), repo.listWishlist(userId)]);
  const have = new Set(library.map((e) => e.titleId));
  // The same show can sit in the library under another catalogue id (seed, TMDB, ANN): match by name too.
  const names = await ownedNames([...have]);
  // nameKey → the id the user owns it under, so dates land on the library's own entry.
  const ownedId = new Map((await getRepository().getTitlesByIds([...have])).map((t) => [nameKey(t), t.id]));
  const wished = new Set(wishlist.map((w) => w.titleId));
  const result: HistoryResult = { added: [], days: 0, already: 0, notFound: [] };
  // Plays already on record per title, day and season, so a second import only tops up what is missing.
  const seen = new Map<string, number>();
  const keyOf = (titleId: string, day: string, season: number | null, providerId: string | null = "netflix") => `${titleId}|${day}|${season ?? 0}|${providerId ?? "unknown"}`;
  for (const e of await repo.listWatchEvents(userId, new Date(0))) {
    const k = keyOf(e.titleId, e.watchedAt.slice(0, 10), e.season, e.providerId ?? null);
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if (e.providerId === "netflix" && e.season === null && e.episode === null && e.watchedAt.endsWith("T12:00:00.000Z")) {
      const dayKey = dayKeyOf(e.titleId, day);
      legacySeen.set(dayKey, (legacySeen.get(dayKey) ?? 0) + 1);
    }
  }

  // An anime found under its TMDB id is filed under its franchise card, as the title page does, so the same show is there once.
  const found = await matchWithin(items, (item) => match(item).then((t) => t && asFranchise(t)), budgetMs);
  if (budgetMs !== undefined) result.pending = items.slice(found.length);
  await cacheTitles(repo, found.filter((t): t is Title => t !== null));

  for (const [i, title] of found.entries()) {
    const item = items[i]!;
    if (!title) {
      result.notFound.push({ title: item.title, sample: item.sample });
      continue;
    }
    // The title in the library may sit under another id: dates go to the one the user owns.
    const owned = have.has(title.id) || names.has(nameKey(title));
    if (owned) result.already += 1;
    else {
      if (title.type === "movie") await repo.setLibraryStatus(userId, title.id, "completed");
      else await repo.markSeenThrough(userId, title.id, Math.max(1, item.season ?? 1));
      if (wished.has(title.id)) await repo.removeFromWishlist(userId, title.id);
      have.add(title.id);
      ownedId.set(nameKey(title), title.id);
      names.add(nameKey(title));
      result.added.push(title.title);
    }
    if (!item.watched?.length) continue;
    const target = have.has(title.id) ? title.id : (ownedId.get(nameKey(title)) ?? title.id);
    for (const w of item.watched) {
      const k = keyOf(target, w.d, w.s ?? null);
      const exactSeen = seen.get(k) ?? 0;
      const requested = w.n ?? 1;
      const exactMissing = Math.max(0, requested - exactSeen);
      const legacyKey = dayKeyOf(target, w.d);
      const legacy = w.s !== undefined ? (legacySeen.get(legacyKey) ?? 0) : 0;
      const offset = Math.min(exactMissing, legacy);
      const missing = exactMissing - offset;
      if (offset) legacySeen.set(legacyKey, legacy - offset);
      if (missing <= 0) continue;
      seen.set(k, exactSeen + missing);
      for (let n = 0; n < missing; n++) {
        await repo.addWatchEvent({ userId, titleId: target, watchedAt: `${w.d}T12:00:00.000Z`, minutes: 0, season: w.s ?? null, episode: null, providerId: "netflix" });
        result.days += 1;
      }
    }
  }
  return result;
}

/** Runtime helper for callers that explicitly need an estimate; history imports store 0 instead. */
export function playMinutes(title: Title): number {
  const known = title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes;
  return known > 0 ? known : title.type === "movie" ? 100 : 40;
}

async function byName(name: string, series: boolean): Promise<Title | null> {
  const key = searchKey(name);
  if (!key) return null;
  const local = (await getRepository().searchTitles(name, 8)).filter((t) => searchKey(t.title) === key && (!series || t.type !== "movie"));
  // A namesake cached without a poster is often the wrong one (a stub): only a title with artwork counts.
  const known = local.find((t) => t.artwork.posterUrl);
  if (known) return known;
  return (await getCatalog().findByName(name, { series, provider: "netflix" })) ?? local[0] ?? null;
}

/** Netflix sometimes repeats the show's name: "Avatar - La leggenda di Aang: Avatar - La leggenda di Aang: Libro primo". */
export function withoutRepeats(name: string): string {
  const parts = name.split(/\s*:\s+/);
  return parts.filter((p, n) => n === 0 || searchKey(p) !== searchKey(parts[n - 1]!)).join(": ");
}

export async function match(raw: HistoryItem): Promise<Title | null> {
  const item = { ...raw, title: withoutRepeats(raw.title), sample: withoutRepeats(raw.sample) };
  if (item.kind === "series") return (await byName(item.title, true)) ?? byName(item.title, false);
  if (item.kind === "film") return byName(item.title, false);
  // "Name: something": a film with a subtitle, or a series episode without a season.
  const whole = await byName(item.sample, false);
  if (whole) return whole;
  return byName(item.title, true);
}
