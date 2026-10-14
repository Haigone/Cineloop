import "server-only";
import { isOpenSaga, sagaNotices, sagaStatus, type SagaStatus } from "@/domain/collections";
import type { CollectionChoice, FilmCollection, LibraryEntry, Movie, Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { italianDay } from "@/lib/dates";
import { cacheTitles } from "./explore";

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
