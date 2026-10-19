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
export const CURATED_COLLECTIONS = [
  { slug: "marvel-cinematic-universe", name: "Marvel Cinematic Universe", description: "L'universo condiviso Marvel. X-Men e le linee cinematografiche autonome di Spider-Man non vengono mescolate automaticamente.", terms: ["Iron Man", "The Incredible Hulk", "Iron Man 2", "Thor", "Captain America: The First Avenger", "The Avengers", "Guardians of the Galaxy", "Avengers: Endgame"], palette: ["#b91c1c", "#160b10", "#fbbf24"] as const },
  { slug: "universo-dc", name: "Universo DC", description: "Le principali incarnazioni cinematografiche DC, mantenendo separate le continuità DCEU, DCU e i film autonomi.", terms: ["Man of Steel", "Batman v Superman: Dawn of Justice", "Wonder Woman", "Aquaman", "The Batman", "Joker"], palette: ["#2563eb", "#071326", "#7dd3fc"] as const },
  { slug: "star-wars", name: "Star Wars", description: "Le trilogie e i film antologici della galassia di Star Wars; l'ordine proposto è cinematografico e non fonde automaticamente le serie TV.", terms: ["Star Wars: Episode IV - A New Hope", "Star Wars: Episode V - The Empire Strikes Back", "Star Wars: Episode VI - Return of the Jedi", "Star Wars: Episode I - The Phantom Menace", "Rogue One: A Star Wars Story", "Solo: A Star Wars Story"], palette: ["#ca8a04", "#100e16", "#fef3c7"] as const },
  { slug: "wizarding-world", name: "Wizarding World", description: "Harry Potter e Animali Fantastici nello stesso mondo, mantenendo le rispettive saghe e i loro ordini distinti.", terms: ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "Harry Potter and the Prisoner of Azkaban", "Fantastic Beasts and Where to Find Them", "Fantastic Beasts: The Crimes of Grindelwald"], palette: ["#7c3aed", "#10091c", "#c4b5fd"] as const },
  { slug: "terra-di-mezzo", name: "Terra di Mezzo", description: "Un universo condiviso che raccoglie Lo Hobbit e Il Signore degli Anelli, lasciando le due saghe separate.", terms: ["The Hobbit: An Unexpected Journey", "The Hobbit: The Desolation of Smaug", "The Lord of the Rings: The Fellowship of the Ring", "The Lord of the Rings: The Two Towers", "The Lord of the Rings: The Return of the King"], palette: ["#15803d", "#07130d", "#d9f99d"] as const },
  { slug: "cinepanettoni", name: "Cinepanettoni", description: "Una collezione tematica dedicata alla commedia natalizia italiana. Vengono mostrati solo i titoli realmente trovati nel catalogo.", terms: ["Vacanze di Natale", "Vacanze di Natale '90", "Natale sul Nilo", "Natale a Miami", "Natale in crociera"], palette: ["#dc2626", "#19080b", "#fde68a"] as const },
] as const;

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
  const results = await Promise.all(definition.terms.map(async (term) => {
    const cachedMatch = cached.find((title) => title.type === "movie" && searchKey(title.title) === searchKey(term));
    if (cachedMatch) return cachedMatch;
    const hits = await getCatalog().search(term, 5).catch(() => []);
    return hits.find((hit) => searchKey(hit.title) === searchKey(term))
      ?? hits.find((hit) => searchKey(hit.title).startsWith(searchKey(term)) || searchKey(term).startsWith(searchKey(hit.title)))
      ?? null;
  }));
  const movies = [...new Map(results.filter((title): title is Movie => title?.type === "movie").map((movie) => [movie.id, movie])).values()];
  if (movies.length) await cacheTitles(getRepository(), movies);
  const first = movies[0];
  return {
    id: `demo-collection-${definition.slug}`,
    name: definition.name,
    overview: definition.description,
    artwork: first?.artwork ?? { posterUrl: null, backdropUrl: null, palette: definition.palette },
    parts: movies.map((title) => ({ title, releaseDate: title.year ? `${title.year}-01-01` : null })),
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
