import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Layers3 } from "lucide-react";
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
  const view = await getCollectionDetailView(`demo-collection-${slug}`);
  if (!view) notFound();
  const { collection } = view.saga;
  const image = collection.artwork.backdropUrl ?? collection.artwork.posterUrl;
  const total = view.saga.total;
  const seen = view.saga.seen;
  const inProgress = view.saga.rows.filter((row) => row.included && row.status === "watching").length;
  const progressPercent = total ? Math.round((seen / total) * 100) : 0;
  return <main className="space-y-7">
    <Link href="/collections" className="inline-flex items-center gap-2 text-sm text-fg-2 hover:text-fg"><ArrowLeft className="size-4" /> Tutte le collezioni</Link>
    <section className="relative isolate -mx-4 overflow-hidden rounded-3xl border border-violet-300/30 bg-[#111017] sm:mx-0">
      {image && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center opacity-80" style={{ backgroundImage: `url("${image}")` }} />}
      {!image && collection.parts[0] && <KeyArt title={collection.parts[0].title} variant="backdrop" className="absolute inset-0 -z-20 opacity-60" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,8,14,.98),rgba(8,8,14,.72)_55%,rgba(8,8,14,.25))]" />
      <div className="p-6 sm:p-10"><span className="inline-flex items-center gap-2 rounded-full border border-violet-200/30 bg-black/30 px-3 py-1 text-[10px] font-bold tracking-[.2em] text-violet-100"><Layers3 className="size-3.5" /> COLLEZIONE CINELOOP</span>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{collection.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{definition.description}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3"><FollowCollectionButton collectionId={collection.id} initialFollowed={view.followed} />{(view.saga.next?.title ?? view.saga.upcoming[0]?.title ?? view.saga.rows.find((row) => row.included && row.status !== "completed")?.part.title) && <Link href={`/title/${(view.saga.next?.title ?? view.saga.upcoming[0]?.title ?? view.saga.rows.find((row) => row.included && row.status !== "completed")!.part.title).id}?collection=${encodeURIComponent(collection.id)}`} className="inline-flex items-center gap-2 rounded-full bg-violet-300 px-4 py-2.5 text-sm font-semibold text-[#160d27] transition hover:bg-violet-200">Inizia a guardare la collezione <ArrowRight className="size-4" /></Link>}<span className="text-xs text-white/75">{seen}/{total} completati · {inProgress} in corso · {collection.parts.length} titoli caricati su {definition.items.length}</span></div>
        <div className="mt-5 max-w-xl"><div className="mb-2 flex items-center justify-between text-xs text-white/65"><span>Avanzamento della collezione</span><span>{progressPercent}%</span></div><div role="progressbar" aria-label="Avanzamento della collezione" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progressPercent}%` }} /></div></div>
      </div>
    </section>
    <CollectionShortcuts compact />
    <section><SectionHeader as="h2" title="Ordine di visione" description="Puoi aprire qualsiasi film e registrarlo autonomamente. Solo con “Inizia a guardare la collezione” attivi la coda guidata che propone il prossimo titolo quando completi quello corrente." />
      {collection.parts.length ? <ol className="space-y-3">{view.saga.rows.map((row, index) => <li key={row.part.title.id} className="overflow-hidden rounded-2xl border border-violet-200/20 bg-[linear-gradient(110deg,rgba(91,33,182,.11),rgba(18,18,25,.98))]">
        <Link href={`/title/${row.part.title.id}?collection=${encodeURIComponent(collection.id)}`} className="flex items-center gap-3 p-3 transition hover:bg-white/[.03] sm:gap-4 sm:p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-violet-200/25 bg-violet-300/10 text-sm font-semibold text-violet-100">{index + 1}</span>
          <KeyArt title={row.part.title} variant="poster" className="aspect-[2/3] w-14 shrink-0 rounded-lg border border-white/10 sm:w-16" />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{row.part.title.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-white/55"><CalendarDays className="size-3.5" />{row.part.title.year || "Anno non disponibile"}{row.status === "completed" ? " · Visto" : row.status === "watching" ? " · In corso" : ""}</span></span>{row.status === "completed" ? <CheckCircle2 aria-label="Completato" className="size-5 shrink-0 text-emerald-400" /> : row.status === "watching" ? <Clock3 aria-label="In corso" className="size-5 shrink-0 text-sky-300" /> : <span className="size-5 shrink-0" />}<ArrowRight className="size-4 shrink-0 text-violet-200/70" />
        </Link>
      </li>)}</ol> : <p className="rounded-xl border border-line p-5 text-sm text-fg-2">Non ci sono ancora titoli corrispondenti nel catalogo collegato. La pagina si aggiornerà quando i titoli saranno disponibili.</p>}
    </section>
  </main>;
}
