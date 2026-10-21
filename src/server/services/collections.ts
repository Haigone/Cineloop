import "server-only";
import { isOpenSaga, sagaNotices, sagaStatus, type SagaStatus } from "@/domain/collections";
import type { CollectionChoice, CollectionPart, FilmCollection, LibraryEntry, Movie, Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { italianDay } from "@/lib/dates";
import { cacheTitles } from "./explore";
import { searchKey } from "@/lib/text";
import { COLLECTION_FOLLOW_MARKER, COLLECTION_CONTEXT_PREFIX } from "@/domain/collections";

/** At most this many watched films are asked which saga they belong to per page view (answers are cached for a day). */
const CHECK_LIMIT = 30;
/** At most this many sagas are loaded per page view, the most recently watched first. */
const SAGA_LIMIT = 12;

/** A film that can be part of a saga: films made from an anime series live with their series instead. */
function sagaFilm(t: Title | undefined): t is Movie {
  return t?.type === "movie" && !t.partOf;
}

/** A saga from the catalogue; its films are cached so their pages open and they can be saved. */
export async function loadCollection(repo: Repository, id: string): Promise<FilmCollection | null> {
  const collection = await getCatalog()
    .collection(id)
    .catch(() => null);
  if (!collection) return null;
  const known = new Map((await repo.getTitlesByIds(collection.parts.map((p) => p.title.id))).map((t) => [t.id, t]));
  const missing = collection.parts.map((p) => p.title).filter((t) => {
    const k = known.get(t.id);
    return !k || (k.type === "movie" && k.collection === undefined);
  });
  if (missing.length) await cacheTitles(repo, missing);
  return collection;
}

/** The saga a film page shows, in the viewer's order, with what they have seen. Null for a film of its own. */
export async function getSagaView(title: Title): Promise<SagaStatus | null> {
  if (!sagaFilm(title) || !title.collection) return null;
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [collection, choices, library] = await Promise.all([
    loadCollection(repo, title.collection.id),
    repo.listCollectionChoices(viewer.id),
    repo.listLibrary(viewer.id),
  ]);
  if (!collection || collection.parts.length < 2) return null;
  const choice = choices.find((c) => c.collectionId === collection.id);
  return sagaStatus(collection, choice, new Map(library.map((e) => [e.titleId, e.status])), italianDay());
}

/**
 * Sagas the user has started (a film of it seen or being watched) with films
 * still to watch or still to come out. Films cached from a list do not say
 * which saga they belong to yet: those are asked once, then remembered.
 */
export async function listOpenSagas(
  repo: Repository,
  userId: string,
  library: readonly LibraryEntry[],
  titles: ReadonlyMap<string, Title>,
  today: string,
): Promise<SagaStatus[]> {
  const watched = library
    .filter((e) => e.status === "completed" || e.status === "watching")
    .sort((a, b) => Date.parse(b.lastWatchedAt ?? b.addedAt) - Date.parse(a.lastWatchedAt ?? a.addedAt))
    .map((e) => titles.get(e.titleId))
    .filter(sagaFilm);

  const unchecked = watched.filter((f) => f.collection === undefined && /^tmdb-movie-/.test(f.id)).slice(0, CHECK_LIMIT);
  const refreshed = (
    await Promise.all(
      unchecked.map((f) =>
        getCatalog()
          .getTitle(f.id)
          .catch(() => null),
      ),
    )
  ).filter((t): t is Movie => t?.type === "movie" && t.collection !== undefined);
  if (refreshed.length) await cacheTitles(repo, refreshed);
  const fresh = new Map(refreshed.map((t) => [t.id, t]));

  const ids = [
    ...new Set(
      watched
        .map((f) => (fresh.get(f.id) ?? f).collection?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, SAGA_LIMIT);
  if (ids.length === 0) return [];

  const [choices, collections] = await Promise.all([repo.listCollectionChoices(userId), Promise.all(ids.map((id) => loadCollection(repo, id)))]);
  const statuses = new Map(library.map((e) => [e.titleId, e.status]));
  return collections
    .filter((c): c is FilmCollection => c !== null && c.parts.length > 1)
    .map((c) => sagaStatus(c, choices.find((x: CollectionChoice) => x.collectionId === c.id), statuses, today))
    .filter(isOpenSaga);
}

/** Leaves a notification for each saga reminder the user has not had yet (the same text is never sent twice). */
export async function notifySagas(repo: Repository, userId: string, sagas: readonly SagaStatus[], today: string): Promise<void> {
  const notices = sagas.flatMap((s) => sagaNotices(s, today));
  if (notices.length === 0) return;
  const existing = new Set((await repo.listNotifications(userId)).map((n) => n.message));
  for (const n of notices) {
    if (existing.has(n.message)) continue;
    existing.add(n.message);
    await repo.createNotification({ userId, kind: "system", message: n.message, href: `/title/${n.titleId}`, at: new Date().toISOString() });
  }
}


/** Editorial collections are CineLoop-owned; their membership is resolved against the live catalogue. */

/** These IDs are editorial data: never resolve a curated item by its title. */
export const CURATED_COLLECTIONS = [
  { slug: "marvel-cinematic-universe", name: "Marvel Universe", description: "Marvel Cinematic Universe: film e serie della Saga dell'Infinito e della Saga del Multiverso, nell'ordine narrativo scelto da CineLoop.", items: [
    ["Eyes of Wakanda", 241388, "tv"],
    ["Captain America: The First Avenger", 1771, "movie"],
    ["Captain Marvel", 299537, "movie"],
    ["Iron Man", 1726, "movie"],
    ["Iron Man 2", 10138, "movie"],
    ["The Incredible Hulk", 1724, "movie"],
    ["Thor", 10195, "movie"],
    ["The Avengers", 24428, "movie"],
    ["Thor: The Dark World", 76338, "movie"],
    ["Iron Man 3", 68721, "movie"],
    ["Captain America: The Winter Soldier", 100402, "movie"],
    ["Guardians of the Galaxy", 118340, "movie"],
    ["Guardians of the Galaxy Vol. 2", 283995, "movie"],
    ["Avengers: Age of Ultron", 99861, "movie"],
    ["Ant-Man", 102899, "movie"],
    ["Captain America: Civil War", 271110, "movie"],
    ["Black Widow", 497698, "movie"],
    ["Black Panther", 284054, "movie"],
    ["Spider-Man: Homecoming", 315635, "movie"],
    ["Doctor Strange", 284052, "movie"],
    ["Thor: Ragnarok", 284053, "movie"],
    ["Ant-Man and the Wasp", 363088, "movie"],
    ["Avengers: Infinity War", 299536, "movie"],
    ["Avengers: Endgame", 299534, "movie"],
    ["Loki", 84958, "tv"],
    ["WandaVision", 85271, "tv"],
    ["The Falcon and the Winter Soldier", 88396, "tv"],
    ["Spider-Man: Far From Home", 429617, "movie"],
    ["Shang-Chi and the Legend of the Ten Rings", 566525, "movie"],
    ["Eternals", 524434, "movie"],
    ["Hawkeye", 88329, "tv"],
    ["Spider-Man: No Way Home", 634649, "movie"],
    ["Moon Knight", 92749, "tv"],
    ["Doctor Strange in the Multiverse of Madness", 453395, "movie"],
    ["Ms. Marvel", 92783, "tv"],
    ["Thor: Love and Thunder", 616037, "movie"],
    ["She-Hulk: Attorney at Law", 92782, "tv"],
    ["Black Panther: Wakanda Forever", 505642, "movie"],
    ["Werewolf by Night", 1065414, "movie"],
    ["The Guardians of the Galaxy Holiday Special", 838330, "movie"],
    ["Ant-Man and the Wasp: Quantumania", 640146, "movie"],
    ["Guardians of the Galaxy Vol. 3", 447365, "movie"],
    ["Secret Invasion", 114461, "tv"],
    ["The Marvels", 609681, "movie"],
    ["Echo", 209265, "tv"],
    ["Agatha All Along", 121361, "tv"],
    ["Deadpool & Wolverine", 533535, "movie"],
    ["Captain America: Brave New World", 822119, "movie"],
    ["Daredevil: Born Again", 202555, "tv"],
    ["Thunderbolts*", 986056, "movie"],
    ["Ironheart", 114464, "tv"],
    ["The Fantastic Four: First Steps", 617127, "movie"],
    ["Marvel Zombies", 196553, "tv"],
    ["Wonder Man", 125988, "tv"],
    ["Spider-Man: Brand New Day", 969681, "movie"],
  ] as const, palette: ["#b91c1c", "#160b10", "#fbbf24"] as const },
  { slug: "wizarding-world", name: "Harry Potter e Animali Fantastici", description: "Il Wizarding World: tutti gli otto film di Harry Potter e i tre film di Animali Fantastici, in ordine cronologico interno.", items: [
    ["Fantastic Beasts and Where to Find Them", 259316, "movie"],
    ["Fantastic Beasts: The Crimes of Grindelwald", 338952, "movie"],
    ["Fantastic Beasts: The Secrets of Dumbledore", 338953, "movie"],
    ["Harry Potter and the Philosopher's Stone", 671, "movie"],
    ["Harry Potter and the Chamber of Secrets", 672, "movie"],
    ["Harry Potter and the Prisoner of Azkaban", 673, "movie"],
    ["Harry Potter and the Goblet of Fire", 674, "movie"],
    ["Harry Potter and the Order of the Phoenix", 675, "movie"],
    ["Harry Potter and the Half-Blood Prince", 767, "movie"],
    ["Harry Potter and the Deathly Hallows: Part 1", 12444, "movie"],
    ["Harry Potter and the Deathly Hallows: Part 2", 12445, "movie"],
  ] as const, palette: ["#7c3aed", "#10091c", "#c4b5fd"] as const },
  { slug: "star-wars", name: "Star Wars", description: "La galassia di Star Wars: saga degli Skywalker, film antologici e serie animate e live-action, nell'ordine narrativo scelto da CineLoop.", items: [
    ["Star Wars: Episode I - The Phantom Menace", 1893, "movie"],
    ["Star Wars: Episode II - Attack of the Clones", 1894, "movie"],
    ["Star Wars: The Clone Wars (film)", 12180, "movie"],
    ["Star Wars: The Clone Wars (serie TV)", 4194, "tv"],
    ["Star Wars: Episode III - Revenge of the Sith", 1895, "movie"],
    ["The Bad Batch", 105971, "tv"],
    ["Solo: A Star Wars Story", 348350, "movie"],
    ["Obi-Wan Kenobi", 93405, "tv"],
    ["Andor", 83867, "tv"],
    ["Rogue One: A Star Wars Story", 330459, "movie"],
    ["Star Wars: Episode IV - A New Hope", 11, "movie"],
    ["Star Wars: Episode V - The Empire Strikes Back", 1891, "movie"],
    ["Star Wars: Episode VI - Return of the Jedi", 1892, "movie"],
    ["The Mandalorian", 82856, "tv"],
    ["The Book of Boba Fett", 115036, "tv"],
    ["Ahsoka", 114474, "tv"],
    ["Star Wars: Resistance", 81283, "tv"],
    ["Star Wars: Episode VII - The Force Awakens", 140607, "movie"],
    ["Star Wars: Episode VIII - The Last Jedi", 181808, "movie"],
    ["Star Wars: Episode IX - The Rise of Skywalker", 181812, "movie"],
    ["Tales of the Jedi", 202758, "tv"],
    ["Tales of the Empire", 247544, "tv"],
    ["Tales of the Underworld", null, "tv"],
    ["Star Wars: Visions", 129712, "tv"],
    ["Young Jedi Adventures", 215802, "tv"],
    ["Skeleton Crew", 198086, "tv"],
    ["The Acolyte", 115034, "tv"],
  ] as const, palette: ["#ca8a04", "#100e16", "#fef3c7"] as const }
] as const;
const DISPLAYED_SAGA_TERMS = ["James Bond", "Mission: Impossible", "Fast & Furious", "Jurassic Park", "Jurassic World", "The Lord of the Rings", "The Hobbit", "Toy Story", "Shrek", "John Wick", "The Hunger Games", "Planet of the Apes", "Transformers", "Pirates of the Caribbean", "The Matrix", "Back to the Future", "Rocky", "Creed", "Terminator", "Alien", "Predator", "Die Hard", "Bourne", "Kung Fu Panda", "Ice Age", "Madagascar", "Despicable Me", "How to Train Your Dragon", "Scream", "Halloween", "Final Destination", "Saw", "The Conjuring", "Indiana Jones", "Star Trek", "Ghostbusters", "Men in Black", "The Karate Kid", "Rambo", "Beverly Hills Cop", "Godzilla", "King Kong", "Lethal Weapon", "Bad Boys", "Ocean's", "Blade Runner", "Tron"] as const;

export interface CollectionQueueItem {
  collection: FilmCollection;
  currentTitleId: string | null;
  next: CollectionPart | null;
}
function hasMarker(choice: CollectionChoice, marker: string) { return choice.excluded.includes(marker); }
function contextTitleId(choice: CollectionChoice) { return choice.excluded.find((value) => value.startsWith(COLLECTION_CONTEXT_PREFIX))?.slice(COLLECTION_CONTEXT_PREFIX.length) ?? null; }

async function loadCuratedCollection(slugOrId: string): Promise<FilmCollection | null> {
  const definition = CURATED_COLLECTIONS.find((item) => item.slug === slugOrId || `demo-collection-${item.slug}` === slugOrId);
  if (!definition) return null;
  const repo = getRepository();
  const cached = await repo.listTitles();
  const titles = await Promise.all(definition.items.map(async ([, tmdbId, mediaType]) => {
    if (tmdbId === null) return null;
    const id = `tmdb-${mediaType}-${tmdbId}`;
    const cachedMatch = cached.find((title) => title.id === id);
    if (cachedMatch) return cachedMatch;
    return getCatalog().getTitle(id).catch(() => null);
  }));
  const uniqueTitles = [...new Map(titles.filter((title): title is Title => title !== null).map((title) => [title.id, title])).values()];
  if (uniqueTitles.length) await cacheTitles(repo, uniqueTitles);
  const first = uniqueTitles[0];
  return {
    id: `demo-collection-${definition.slug}`,
    name: definition.name,
    overview: definition.description,
    artwork: first?.artwork ?? { posterUrl: null, backdropUrl: null, palette: definition.palette },
    parts: uniqueTitles.map((title) => ({ title, releaseDate: title.year ? `${title.year}-01-01` : null })),
  };
}
async function loadCineLoopCollection(id: string) {
  if (id.startsWith("tmdb-collection-")) return loadCollection(getRepository(), id);
  if (id.startsWith("demo-collection-")) return loadCuratedCollection(id);
  return null;
}

/** The saga catalogue refreshes unknown TMDB memberships and groups the resulting current collection IDs. */
export async function getSagaCatalogView(): Promise<{ saga: SagaStatus; followed: boolean }[]> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const cached = await repo.listTitles();
  const candidates = cached.filter((title): title is Movie => title.type === "movie" && !title.partOf);
  const unchecked = candidates.filter((title) => title.collection === undefined && /^tmdb-movie-/.test(title.id)).slice(0, CHECK_LIMIT);
  const refreshed = (await Promise.all(unchecked.map((title) => getCatalog().getTitle(title.id).catch(() => null))))
    .filter((title): title is Movie => title?.type === "movie" && title.collection !== undefined);
  if (refreshed.length) await cacheTitles(repo, refreshed);
  const latest = new Map(refreshed.map((title) => [title.id, title]));
  const ids = [...new Set(candidates.map((title) => (latest.get(title.id) ?? title).collection?.id).filter((id): id is string => Boolean(id)))].slice(0, SAGA_LIMIT * 3);
  const [library, choices, collections] = await Promise.all([repo.listLibrary(viewer.id), repo.listCollectionChoices(viewer.id), Promise.all(ids.map((id) => loadCollection(repo, id)))]);
  const statuses = new Map(library.map((entry) => [entry.titleId, entry.status]));
  return collections.filter((collection): collection is FilmCollection => Boolean(collection && collection.parts.length > 1))
    .filter((collection) => DISPLAYED_SAGA_TERMS.some((term) => searchKey(collection.name).includes(searchKey(term))))
    .map((collection) => ({ saga: sagaStatus(collection, choices.find((choice) => choice.collectionId === collection.id), statuses, italianDay()), followed: Boolean(choices.find((choice) => choice.collectionId === collection.id && hasMarker(choice, COLLECTION_FOLLOW_MARKER))) }))
    .sort((a, b) => a.saga.collection.name.localeCompare(b.saga.collection.name, "it"));
}

export async function getCollectionDetailView(id: string): Promise<{ saga: SagaStatus; followed: boolean } | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [collection, choices, library] = await Promise.all([loadCineLoopCollection(id), repo.listCollectionChoices(viewer.id), repo.listLibrary(viewer.id)]);
  if (!collection) return null;
  const choice = choices.find((item) => item.collectionId === collection.id);
  return { saga: sagaStatus(collection, choice, new Map(library.map((entry) => [entry.titleId, entry.status])), italianDay()), followed: Boolean(choice && hasMarker(choice, COLLECTION_FOLLOW_MARKER)) };
}

/** Only collections explicitly followed or entered from their own page drive Home's queue. */
export async function getFollowedCollectionQueues(repo: Repository, userId: string, library: readonly LibraryEntry[]): Promise<CollectionQueueItem[]> {
  const choices = (await repo.listCollectionChoices(userId)).filter((choice) => hasMarker(choice, COLLECTION_FOLLOW_MARKER));
  const statuses = new Map(library.map((entry) => [entry.titleId, entry.status]));
  const loaded = await Promise.all(choices.map(async (choice) => ({ choice, collection: await loadCineLoopCollection(choice.collectionId) })));
  return loaded.flatMap(({ choice, collection }): CollectionQueueItem[] => {
    if (!collection || !collection.parts.length) return [];
    const saga = sagaStatus(collection, choice, statuses, italianDay());
    const contextId = contextTitleId(choice);
    const current = contextId && statuses.get(contextId) === "watching" ? contextId : null;
    if (current) {
      const currentIndex = saga.rows.findIndex((row) => row.part.title.id === current && row.included);
      const next = currentIndex < 0 ? null : saga.rows.slice(currentIndex + 1).find((row) => row.included && row.released && row.status !== "completed")?.part ?? null;
      return [{ collection, currentTitleId: current, next }];
    }
    // If a film was started independently, do not duplicate it as a collection card.
    if (saga.next && saga.rows.find((row) => row.part.title.id === saga.next?.title.id)?.status === "watching") return [];
    return [{ collection, currentTitleId: null, next: saga.next }];
  }).filter((item) => item.next !== null || item.currentTitleId !== null);
}
