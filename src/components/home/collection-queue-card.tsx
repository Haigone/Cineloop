import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";
import type { CollectionQueueItem } from "@/server/services/collections";
import { KeyArt } from "@/components/media/key-art";

export function CollectionQueueCard({ item }: { item: CollectionQueueItem }) {
  if (!item.next) return null;
  const { collection, next, currentTitleId } = item;
  return <li className="min-w-0"><div className="relative overflow-hidden rounded-2xl border border-violet-300/45 bg-[linear-gradient(135deg,rgba(91,33,182,.18),rgba(17,17,24,.98))] p-3 shadow-[0_0_28px_rgba(139,92,246,.08)]">
    <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-violet-200/35 bg-violet-950/85 px-2.5 py-1 text-[10px] font-extrabold tracking-[.14em] text-violet-100"><Layers3 className="size-3" /> COLLEZIONE</div>
    <Link href={`/title/${next.title.id}?collection=${encodeURIComponent(collection.id)}`} className="flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
      <KeyArt title={next.title} variant="poster" className="aspect-[2/3] w-16 shrink-0 rounded-lg border border-violet-200/30 shadow-md" />
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/80">Prossimo in coda</span><span className="mt-1 block font-semibold text-white">{next.title.title}</span><span className="mt-1 block text-xs text-white/60">{collection.name}{currentTitleId ? " · dopo il film in corso" : " · ordine di visione"}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-100">Apri titolo <ArrowRight className="size-3.5" /></span></span>
    </Link>
  </div></li>;
}
