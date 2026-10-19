import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, LibraryBig } from "lucide-react";
import { CURATED_COLLECTIONS, getCollectionDetailView } from "@/server/services/collections";
import { CollectionShortcuts } from "@/components/collections/category-shortcuts";
import { SectionHeader } from "@/components/ui/section-header";
import { KeyArt } from "@/components/media/key-art";

export const metadata: Metadata = { title: "Collezioni" };

export default function CollectionsPage() { return <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />}><CollectionsContent /></Suspense>; }

async function CollectionsContent() {
  const cards = await Promise.all(CURATED_COLLECTIONS.map(async (definition) => ({ definition, view: await getCollectionDetailView(`demo-collection-${definition.slug}`) })));
  return <main className="space-y-6">
    <section className="relative isolate overflow-hidden rounded-3xl border border-violet-300/25 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.22),transparent_50%),linear-gradient(120deg,#171027,#0b0c12_72%)] px-5 py-8 sm:px-8 sm:py-10">
      <div aria-hidden className="absolute -left-10 -top-16 -z-10 size-64 rounded-full border border-violet-100/10 bg-violet-300/5 blur-2xl" />
      <p className="flex items-center gap-2 text-xs font-bold tracking-[.24em] text-violet-200"><LibraryBig className="size-4" /> UNIVERSI CURATI</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Collezioni CineLoop</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Universi condivisi e raccolte tematiche: ogni collezione ha la propria pagina, artwork, ordine di visione personale e una coda che puoi seguire dalla Home.</p>
    </section>
    <CollectionShortcuts compact />
    <section><SectionHeader as="h2" title="Scegli il tuo universo" description="La lista dei titoli viene risolta sul catalogo collegato; i titoli non disponibili non vengono inventati." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ definition, view }) => {
        const c = view?.saga.collection; const image = c?.artwork.backdropUrl ?? c?.artwork.posterUrl;
        return <li key={definition.slug} className="group relative isolate min-h-72 overflow-hidden rounded-2xl border border-violet-200/20 bg-[#111017] transition hover:-translate-y-0.5 hover:border-violet-200/55">
          {image && <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${image}")` }} />}
          {!image && c?.parts[0] && <KeyArt title={c.parts[0].title} variant="backdrop" className="absolute inset-0 -z-20 opacity-60" />}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(8,8,14,.98),rgba(8,8,14,.58)_60%,rgba(8,8,14,.12))]" />
          <div className="flex min-h-72 flex-col justify-end p-5"><span className="mb-2 w-fit rounded-full border border-violet-200/25 bg-black/35 px-2.5 py-1 text-[10px] font-bold tracking-widest text-violet-100">COLLEZIONE UFFICIALE</span>
            <h3 className="text-xl font-semibold text-white">{definition.name}</h3><p className="mt-2 line-clamp-3 text-sm leading-5 text-white/65">{definition.description}</p>
            <p className="mt-2 text-xs text-white/50">{c?.parts.length ?? 0} titoli trovati nel catalogo</p><Link href={`/collections/${definition.slug}`} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-violet-100/25 bg-black/35 px-3.5 py-2 text-sm font-semibold text-violet-50 hover:bg-black/55">Apri collezione <ArrowUpRight className="size-4" /></Link>
          </div>
        </li>;
      })}</ul>
    </section>
  </main>;
}
