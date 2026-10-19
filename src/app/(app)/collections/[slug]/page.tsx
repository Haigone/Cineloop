import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Layers3 } from "lucide-react";
import { CURATED_COLLECTIONS, getCollectionDetailView } from "@/server/services/collections";
import { FollowCollectionButton } from "@/components/collections/follow-collection-button";
import { KeyArt } from "@/components/media/key-art";
import { CollectionShortcuts } from "@/components/collections/category-shortcuts";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Collezione" };

export default function CollectionDetailPage({ params }: PageProps<"/collections/[slug]">) { return <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}><CollectionDetailContent params={params} /></Suspense>; }

async function CollectionDetailContent({ params }: { params: PageProps<"/collections/[slug]">["params"] }) {
  const { slug } = await params;
  const definition = CURATED_COLLECTIONS.find((item) => item.slug === slug);
  if (!definition) notFound();
  const view = await getCollectionDetailView(`demo-collection-${slug}`).catch(() => null);
  if (!view) notFound();
  const { collection } = view.saga;
  const image = collection.artwork.backdropUrl ?? collection.artwork.posterUrl;
  return <main className="space-y-7">
    <Link href="/collections" className="inline-flex items-center gap-2 text-sm text-fg-2 hover:text-fg"><ArrowLeft className="size-4" /> Tutte le collezioni</Link>
    <section className="relative isolate -mx-4 overflow-hidden rounded-3xl border border-violet-300/30 bg-[#111017] sm:mx-0">
      {image && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center opacity-80" style={{ backgroundImage: `url("${image}")` }} />}
      {!image && collection.parts[0] && <KeyArt title={collection.parts[0].title} variant="backdrop" className="absolute inset-0 -z-20 opacity-60" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,8,14,.98),rgba(8,8,14,.72)_55%,rgba(8,8,14,.25))]" />
      <div className="p-6 sm:p-10"><span className="inline-flex items-center gap-2 rounded-full border border-violet-200/30 bg-black/30 px-3 py-1 text-[10px] font-bold tracking-[.2em] text-violet-100"><Layers3 className="size-3.5" /> COLLEZIONE CINELOOP</span>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{collection.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{definition.description}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3"><FollowCollectionButton collectionId={collection.id} initialFollowed={view.followed} /><span className="text-xs text-white/55">{collection.parts.length} titoli nel catalogo · ordine personale</span></div>
      </div>
    </section>
    <CollectionShortcuts compact />
    <section><SectionHeader as="h2" title="Ordine di visione" description="I titoli sono ordinati per anno di uscita. Aprendo un film da qui e segnandolo come In corso, CineLoop ricorderà che lo hai scelto dalla collezione e metterà il successivo in coda." />
      {collection.parts.length ? <ol className="space-y-3">{view.saga.rows.map((row, index) => <li key={row.part.title.id} className="overflow-hidden rounded-2xl border border-violet-200/20 bg-[linear-gradient(110deg,rgba(91,33,182,.11),rgba(18,18,25,.98))]">
        <Link href={`/title/${row.part.title.id}?collection=${encodeURIComponent(collection.id)}`} className="flex items-center gap-3 p-3 transition hover:bg-white/[.03] sm:gap-4 sm:p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-violet-200/25 bg-violet-300/10 text-sm font-semibold text-violet-100">{index + 1}</span>
          <KeyArt title={row.part.title} variant="poster" className="aspect-[2/3] w-14 shrink-0 rounded-lg border border-white/10 sm:w-16" />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{row.part.title.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-white/55"><CalendarDays className="size-3.5" />{row.part.title.year || "Anno non disponibile"}{row.status === "completed" ? " · Visto" : row.status === "watching" ? " · In corso" : ""}</span></span><ArrowRight className="size-4 shrink-0 text-violet-200/70" />
        </Link>
      </li>)}</ol> : <p className="rounded-xl border border-line p-5 text-sm text-fg-2">Non ci sono ancora titoli corrispondenti nel catalogo collegato. La pagina si aggiornerà quando i titoli saranno disponibili.</p>}
    </section>
  </main>;
}
