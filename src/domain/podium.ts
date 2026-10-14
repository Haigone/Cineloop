import { sectionOf, type LibraryEntry, type MediaType, type RatingValue, type Title, type UserPreferences } from "./types";

export const PODIUM_CATEGORIES = ["movie", "series", "anime"] as const satisfies readonly MediaType[];
export type PodiumCategory = (typeof PODIUM_CATEGORIES)[number];

export type PodiumPick = { title: Title; rating: RatingValue | null };
export interface CategoryPodium {
  /** The chosen top 3, first place first (fewer while not all chosen). */
  picks: PodiumPick[];
  /** Everything of this category the person has watched, best rated first, to choose from. */
  candidates: PodiumPick[];
}

/**
 * One podium per category from what a person has watched. A podium chosen before categories
 * existed (one list of three) keeps counting, each title in the category it belongs to.
 */
export function buildPodiums(
  prefs: Pick<UserPreferences, "podium" | "podiums">,
  library: readonly LibraryEntry[],
  titles: ReadonlyMap<string, Title>,
): Record<PodiumCategory, CategoryPodium> {
  const watched = library
    .filter((e) => (e.status === "completed" || e.status === "watching") && titles.has(e.titleId))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
    .map((e) => ({ title: titles.get(e.titleId)!, rating: e.rating }));
  const out = {} as Record<PodiumCategory, CategoryPodium>;
  for (const type of PODIUM_CATEGORIES) {
    const candidates = watched.filter((w) => w.title.type === type);
    const byId = new Map(candidates.map((c) => [c.title.id, c]));
    const ids = prefs.podiums[type] ?? prefs.podium.filter((id) => titles.get(id)?.type === type).slice(0, 3);
    out[type] = { picks: ids.map((id) => byId.get(id)).filter((x): x is PodiumPick => x !== undefined), candidates };
  }
  return out;
}

/**
 * What a person has put in their rankings for one Home section: the podium first, in its order,
 * then the best rated titles (the same top list as Classifiche), without repeating the podium.
 */
export function rankedInSection(
  prefs: Pick<UserPreferences, "podium" | "podiums">,
  library: readonly LibraryEntry[],
  titles: ReadonlyMap<string, Title>,
  section: MediaType,
  limit = 10,
): { podium: Title[]; rated: Title[] } {
  const podiums = buildPodiums(prefs, library, titles);
  const podium = PODIUM_CATEGORIES.flatMap((c) => podiums[c].picks.map((p) => p.title)).filter((t) => sectionOf(t) === section);
  const onPodium = new Set(podium.map((t) => t.id));
  const rated = library
    .filter((e) => e.rating != null && titles.has(e.titleId) && sectionOf(titles.get(e.titleId)!) === section)
    .sort((a, b) => b.rating! - a.rating! || Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
    .slice(0, limit)
    .map((e) => titles.get(e.titleId)!)
    .filter((t) => !onPodium.has(t.id));
  return { podium, rated };
}
