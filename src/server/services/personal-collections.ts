import "server-only";

import type { Artwork, FilmCollection, Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { COLLECTION_FOLLOW_MARKER } from "@/domain/collections";
import { CURATED_COLLECTIONS, loadCollection } from "@/server/services/collections";

export type PersonalLibraryGroup = {
  id: string;
  kind: "saga" | "collection";
  name: string;
  href: string;
  total: number;
  completed: number;
  watching: number;
  artwork: Artwork;
};

const fallbackArtwork = (palette: readonly [string, string, string]): Artwork => ({
  posterUrl: null,
  backdropUrl: null,
  palette,
});

function counts(idList: string[], statuses: Map<string, string>) {
  return {
    completed: idList.filter((id) => statuses.get(id) === "completed").length,
    watching: idList.filter((id) => statuses.get(id) === "watching").length,
  };
}

/** Personal group cards for the same grid and category filter as films, series and anime. */
export async function getPersonalLibraryGroups(): Promise<PersonalLibraryGroup[]> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [entries, choices] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listCollectionChoices(viewer.id),
  ]);
  const active = entries.filter((entry) => entry.status === "watching" || entry.status === "completed");
  const statuses = new Map(active.map((entry) => [entry.titleId, entry.status]));
  const followed = choices.filter((choice) => choice.excluded.includes(COLLECTION_FOLLOW_MARKER));
  if (!followed.length) return [];

  const curated = followed.filter((choice) => choice.collectionId.startsWith("demo-collection-"));
  const sagas = followed.filter((choice) => choice.collectionId.startsWith("tmdb-collection-"));
  const groups: PersonalLibraryGroup[] = [];

  const curatedIds = curated.flatMap((choice) => {
    const definition = CURATED_COLLECTIONS.find((item) => `demo-collection-${item.slug}` === choice.collectionId);
    return definition ? definition.items.flatMap(([, tmdbId, mediaType]) => tmdbId === null ? [] : [`tmdb-${mediaType}-${tmdbId}`]) : [];
  });
  const cachedCuratedTitles = await repo.getTitlesByIds([...new Set(curatedIds)]);
  const curatedTitleById = new Map(cachedCuratedTitles.map((title) => [title.id, title]));

  for (const choice of curated) {
    const definition = CURATED_COLLECTIONS.find((item) => `demo-collection-${item.slug}` === choice.collectionId);
    if (!definition) continue;
    const ids = definition.items.flatMap(([, tmdbId, mediaType]) => tmdbId === null ? [] : [`tmdb-${mediaType}-${tmdbId}`]);
    const statusCounts = counts(ids, statuses);
    if (!statusCounts.completed && !statusCounts.watching) continue;
    const artTitle = ids.map((id) => curatedTitleById.get(id)).find((title): title is Title => Boolean(title));
    groups.push({
      id: choice.collectionId,
      kind: "collection",
      name: definition.name,
      href: `/collections/${definition.slug}`,
      total: ids.length,
      ...statusCounts,
      artwork: artTitle?.artwork ?? fallbackArtwork(definition.palette),
    });
  }

  const loadedSagas = await Promise.all(sagas.map(async (choice) => ({
    choice,
    collection: await loadCollection(repo, choice.collectionId),
  })));
  for (const { choice, collection } of loadedSagas) {
    if (!collection || collection.parts.length < 2) continue;
    const ids = collection.parts.map((part) => part.title.id);
    const statusCounts = counts(ids, statuses);
    if (!statusCounts.completed && !statusCounts.watching) continue;
    groups.push({
      id: collection.id,
      kind: "saga",
      name: collection.name,
      href: `/sagas/${encodeURIComponent(collection.id)}`,
      total: collection.parts.length,
      ...statusCounts,
      artwork: collection.artwork,
    });
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name, "it"));
}
