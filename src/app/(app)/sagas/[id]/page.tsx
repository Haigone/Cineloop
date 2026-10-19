import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Clapperboard, Layers3 } from "lucide-react";
import { getCollectionDetailView } from "@/server/services/collections";
import { FollowCollectionButton } from "@/components/collections/follow-collection-button";
import { CollectionShortcuts } from "@/components/collections/category-shortcuts";
import { SagaOrder } from "@/components/title/saga-order";
import { KeyArt } from "@/components/media/key-art";

export const metadata: Metadata = { title: "Saga" };

export default function SagaDetailPage({ params }: PageProps<"/sagas/[id]">) { return <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}><SagaDetailContent params={params} /></Suspense>; }

async function SagaDetailContent({ params }: { params: PageProps<"/sagas/[id]">["params"] }) {
  const { id } = await params;
  if (!/^tmdb-collection-\d{1,12}$/.test(id)) notFound();
  const view = await getCollectionDetailView(id).catch(() => null);
  if (!view) notFound();
  const { collection, rows, next, seen, total, remaining, upcoming } = view.saga;
  const image = collection.artwork.backdropUrl ?? collection.artwork.posterUrl;
  const excluded = rows.filter((row) => !row.included).map((row) => row.part.title.id);
  const releaseIds = [...rows].sort((a, b) => (a.part.releaseDate ?? "9999").localeCompare(b.part.releaseDate ?? "9999")).map((row) => row.part.title.id);
  const customOrder = rows.some((row, index) => row.part.title.id !== releaseIds[index]);
  const currentId = next?.title.id ?? rows[0]?.part.title.id;
  if (!currentId) notFound();
  return <main className="space-y-7"><Link href="/sagas" className="inline-flex items-center gap-2 text-sm text-fg-2 hover:text-fg"><ArrowLeft className="size-4" /> Tutte le saghe</Link>
    <section className="relative isolate overflow-hidden rounded-3xl border border-amber-300/30 bg-[#111017]">
      {image && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center opacity-80" style={{ backgroundImage: `url("${image}")` }} />}
      {!image && collection.parts[0] && <KeyArt title={collection.parts[0].title} variant="backdrop" className="absolute inset-0 -z-20 opacity-60" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,8,14,.98),rgba(8,8,14,.7)_55%,rgba(8,8,14,.22))]" />
      <div className="p-6 sm:p-10"><span className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-black/30 px-3 py-1 text-[10px] font-bold tracking-[.2em] text-amber-100"><Clapperboard className="size-3.5" /> SAGA CINELOOP</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{collection.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{collection.overview || "Ordine di visione, date di uscita e avanzamento personale della saga."}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3"><FollowCollectionButton collectionId={collection.id} initialFollowed={view.followed} /><span className="text-xs text-white/55">{seen}/{total} film visti · {remaining} da vedere · {upcoming.length} in arrivo</span></div>
      </div>
    </section>
    <CollectionShortcuts compact />
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="size-5 text-amber-200" /> Ordine di visione personale</h2><SagaOrder collectionId={collection.id} rows={rows.map((row) => ({ film: row.part.title, releaseDate: row.part.releaseDate, released: row.released, status: row.status }))} excluded={excluded} customOrder={customOrder} currentId={currentId} nextId={next?.title.id ?? null} /></section>
  </main>;
}
