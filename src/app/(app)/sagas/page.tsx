import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clapperboard, ArrowUpRight } from "lucide-react";
import { getSagaCatalogView } from "@/server/services/collections";
import { CollectionShortcuts } from "@/components/collections/category-shortcuts";
import { SectionHeader } from "@/components/ui/section-header";
import { KeyArt } from "@/components/media/key-art";

export const metadata: Metadata = { title: "Saghe" };

export default function SagasPage({ searchParams }: PageProps<"/sagas">) { return <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />}><SagasContent searchParams={searchParams} /></Suspense>; }

async function SagasContent({ searchParams }: { searchParams: PageProps<"/sagas">["searchParams"] }) {
  const params = await searchParams;
  const wishlistOnly = params.scope === "wishlist";
  const allItems = await getSagaCatalogView();
  const items = wishlistOnly ? allItems.filter(({ followed }) => followed) : allItems;
  return <main className="space-y-6">
    <section className="relative isolate overflow-hidden rounded-3xl border border-amber-300/25 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,.2),transparent_48%),linear-gradient(120deg,#1c1409,#0c0d12_72%)] px-5 py-8 sm:px-8 sm:py-10">
      <div aria-hidden className="absolute -right-10 -top-16 -z-10 size-64 rounded-full border border-amber-100/10 bg-amber-300/5 blur-2xl" />
      <p className="flex items-center gap-2 text-xs font-bold tracking-[.24em] text-amber-200"><Clapperboard className="size-4" /> CINELOOP ORIGINALS</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Saghe cinematografiche</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Storie collegate, trilogie e film numerati. Il catalogo viene ricostruito dalle appartenenze TMDB rilevate sui film, così le nuove parti possono comparire senza aggiornare una lista manuale.</p>
    </section>
    <CollectionShortcuts compact />
    <section><SectionHeader as="h2" title={wishlistOnly ? "Saghe seguite" : "Catalogo delle saghe"} description={wishlistOnly ? `${items.length} saghe aggiunte alla tua libreria.` : `${items.length} saghe individuate nel catalogo collegato.`} />
      {wishlistOnly && items.length === 0 && <p className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm text-fg-2">Non hai ancora aggiunto saghe. Apri una saga e scegli “Aggiungi alla mia libreria”.</p>}
      {items.length ? <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(({ saga, followed }) => {
        const c = saga.collection; const image = c.artwork.backdropUrl ?? c.artwork.posterUrl;
        return <li key={c.id} className="group relative isolate min-h-64 overflow-hidden rounded-2xl border border-amber-200/20 bg-[#121116] transition hover:-translate-y-0.5 hover:border-amber-200/55">
          {image && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${image}")` }} />}
          {!image && c.parts[0] && <KeyArt title={c.parts[0].title} variant="backdrop" className="absolute inset-0 -z-20 opacity-60" />}
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#09090d] via-[#09090d]/75 to-black/10" />
          <div className="flex min-h-64 flex-col justify-end p-5"><div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full border border-amber-200/25 bg-black/40 px-2.5 py-1 text-[10px] font-bold tracking-widest text-amber-100">SAGA</span>{followed && <span className="rounded-full bg-amber-100/15 px-2.5 py-1 text-[10px] font-semibold text-amber-100">NELLA TUA LIBRERIA</span>}</div>
            <h3 className="text-xl font-semibold text-white">{c.name}</h3><p className="mt-1 text-sm text-white/65">{saga.total} film · {saga.seen} visti{saga.remaining ? ` · ${saga.remaining} da vedere` : ""}</p>
            <Link href={`/sagas/${encodeURIComponent(c.id)}`} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-amber-100/25 bg-black/30 px-3.5 py-2 text-sm font-semibold text-amber-50 hover:bg-black/50">Apri saga <ArrowUpRight className="size-4" /></Link>
          </div>
        </li>;
      })}</ul> : <div className="rounded-2xl border border-line bg-surface p-6"><p className="font-semibold">Nessuna saga individuata per ora.</p><p className="mt-1 text-sm text-fg-2">Le saghe vengono rilevate dai film TMDB presenti nella cache. Esplora e apri alcuni film: al successivo aggiornamento il catalogo ricontrollerà le appartenenze.</p></div>}
    </section>
  </main>;
}
