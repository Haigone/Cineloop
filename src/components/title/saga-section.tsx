import type { Title } from "@/domain/types";
import { getSagaView } from "@/server/services/collections";
import { SagaOrder } from "./saga-order";
import { FollowCollectionButton } from "@/components/collections/follow-collection-button";

/** "Ordine di visione" for a film of a saga: asks the catalogue, so the page streams it in. */
export async function SagaSection({ title }: { title: Title }) {
  const saga = await getSagaView(title).catch(() => null);
  if (!saga) return null;
  const { collection, rows } = saga;
  const excluded = rows.filter((r) => !r.included).map((r) => r.part.title.id);
  const releaseIds = [...rows].sort((a, b) => (a.part.releaseDate ?? "9999").localeCompare(b.part.releaseDate ?? "9999")).map((r) => r.part.title.id);
  const customOrder = rows.some((r, i) => r.part.title.id !== releaseIds[i]);
  const summary = [
    saga.started ? `Hai visto ${saga.seen} di ${saga.total}` : `${saga.total} film`,
    saga.started && saga.remaining > 0 ? (saga.remaining === 1 ? "te ne manca 1" : `te ne mancano ${saga.remaining}`) : null,
    saga.upcoming.length > 0 ? (saga.upcoming.length === 1 ? "1 in arrivo" : `${saga.upcoming.length} in arrivo`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-labelledby="saga-h">
      <h2 id="saga-h" className="text-[15px] font-semibold">
        Ordine di visione: saga {collection.name}
      </h2>
      <div className="mt-2 mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-fg-2">{summary}</p><FollowCollectionButton collectionId={collection.id} initialFollowed={saga.followed} /></div>
      <SagaOrder
        collectionId={collection.id}
        rows={rows.map((r) => ({ film: r.part.title, releaseDate: r.part.releaseDate, released: r.released, status: r.status }))}
        excluded={excluded}
        customOrder={customOrder}
        currentId={title.id}
        nextId={saga.started ? (saga.next?.title.id ?? null) : null}
      />
    </section>
  );
}
