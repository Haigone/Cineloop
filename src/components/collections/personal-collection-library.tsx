import Link from "next/link";
import { Clapperboard, LibraryBig } from "lucide-react";
import { COLLECTION_FOLLOW_MARKER } from "@/domain/collections";
import type { Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { CURATED_COLLECTIONS } from "@/server/services/collections";
import { KeyArt } from "@/components/media/key-art";

interface PersonalItem {
  title: Title;
  status: "watching" | "completed";
}

interface PersonalGroup {
  id: string;
  name: string;
  items: PersonalItem[];
}

function statusLabel(status: PersonalItem["status"]) {
  return status === "watching" ? "In corso" : "Visto";
}

/**
 * Personal collections are built only from the viewer's saved collection choices
 * and active library entries. This intentionally avoids catalog-wide scans and
 * remote TMDB refreshes on every library visit (important on a constrained DB plan).
 */
export async function PersonalCollectionLibrary() {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [entries, choices] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listCollectionChoices(viewer.id),
  ]);
  const activeEntries = entries.filter(
    (entry) => entry.status === "watching" || entry.status === "completed",
  );
  const titles = await repo.getTitlesByIds(activeEntries.map((entry) => entry.titleId));
  const titleById = new Map(titles.map((title) => [title.id, title]));
  const statusById = new Map(activeEntries.map((entry) => [entry.titleId, entry.status]));
  const followed = choices.filter((choice) => choice.excluded.includes(COLLECTION_FOLLOW_MARKER));

  const sagas = new Map<string, PersonalGroup>();
  const collections = new Map<string, PersonalGroup>();

  for (const choice of followed) {
    if (choice.collectionId.startsWith("demo-collection-")) {
      const definition = CURATED_COLLECTIONS.find(
        (item) => `demo-collection-${item.slug}` === choice.collectionId,
      );
      if (!definition) continue;
      const items = definition.items.flatMap(([, tmdbId, mediaType]) => {
        if (tmdbId === null) return [];
        const id = `tmdb-${mediaType}-${tmdbId}`;
        const title = titleById.get(id);
        const status = statusById.get(id);
        return title && (status === "watching" || status === "completed")
          ? [{ title, status }]
          : [];
      });
      if (items.length) {
        collections.set(choice.collectionId, {
          id: choice.collectionId,
          name: definition.name,
          items,
        });
      }
      continue;
    }

    if (!choice.collectionId.startsWith("tmdb-collection-")) continue;
    const items = titles.flatMap((title) => {
      const status = statusById.get(title.id);
      return title.type === "movie" &&
        title.collection?.id === choice.collectionId &&
        (status === "watching" || status === "completed")
        ? [{ title, status }]
        : [];
    });
    if (!items.length) continue;
    const name = items.find((item) => item.title.type === "movie" && item.title.collection?.name)?.title;
    sagas.set(choice.collectionId, {
      id: choice.collectionId,
      name: name?.type === "movie" ? name.collection?.name || "Saga cinematografica" : "Saga cinematografica",
      items: items.sort((a, b) => a.title.title.localeCompare(b.title.title, "it")),
    });
  }

  return (
    <div className="mt-6 space-y-8">
      <PersonalGroupSection
        title="Saghe"
        description="Le saghe che hai aggiunto alla tua libreria, con i film che hai visto o che stai seguendo."
        groups={[...sagas.values()].sort((a, b) => a.name.localeCompare(b.name, "it"))}
        icon="saga"
      />
      <PersonalGroupSection
        title="Collezioni"
        description="I tuoi universi e le tue raccolte, limitati ai titoli presenti nella tua libreria."
        groups={[...collections.values()].sort((a, b) => a.name.localeCompare(b.name, "it"))}
        icon="collection"
      />
    </div>
  );
}

function PersonalGroupSection({
  title,
  description,
  groups,
  icon,
}: {
  title: string;
  description: string;
  groups: PersonalGroup[];
  icon: "saga" | "collection";
}) {
  const Icon = icon === "saga" ? Clapperboard : LibraryBig;
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface">
          <Icon aria-hidden className="size-5 text-fg-2" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-fg-2">{description}</p>
        </div>
      </div>
      {groups.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <article key={group.id} className="min-w-0 rounded-2xl border border-line bg-surface p-4">
              <h3 className="font-semibold">{group.name}</h3>
              <p className="mt-1 text-xs text-fg-2">
                {group.items.length} {group.items.length === 1 ? "titolo" : "titoli"} · {group.items.filter((item) => item.status === "completed").length} visti · {group.items.filter((item) => item.status === "watching").length} in corso
              </p>
              <ul className="mt-3 space-y-2">
                {group.items.map(({ title: item, status }) => (
                  <li key={item.id}>
                    <Link
                      href={`/title/${encodeURIComponent(item.id)}`}
                      className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-white/[.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <KeyArt title={item} variant="poster" className="aspect-[2/3] w-10 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-fg-2">{item.year || "Anno non disponibile"} · {statusLabel(status)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-2">
          Non hai ancora aggiunto {icon === "saga" ? "saghe" : "collezioni"} con titoli in corso o visti. Quando aggiungerai una saga o una collezione alla tua libreria e inizierai a guardare almeno un titolo, la troverai qui.
        </p>
      )}
    </section>
  );
}
