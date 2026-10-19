import Link from "next/link";
import { Clapperboard, LibraryBig, Sparkles } from "lucide-react";

export function CollectionShortcuts({ compact = false }: { compact?: boolean }) {
  return <nav aria-label="Saghe e collezioni CineLoop" className={`grid gap-3 sm:grid-cols-2 ${compact ? "mb-5" : "mb-7"}`}>
    <Link href="/sagas" className="group relative isolate overflow-hidden rounded-2xl border border-amber-400/30 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,.2),transparent_62%),linear-gradient(125deg,#20170b,#101014_70%)] p-4 shadow-lg transition hover:-translate-y-0.5 hover:border-amber-300/65">
      <div aria-hidden className="absolute -right-4 -top-7 -z-10 size-28 rounded-full border border-amber-200/20 bg-amber-300/5 blur-sm transition group-hover:scale-110" />
      <div className="flex items-center gap-2 text-amber-200"><Clapperboard className="size-5" /><span className="text-xs font-bold tracking-[.2em]">CINELOOP ORIGINALS</span><Sparkles className="ml-auto size-4 opacity-80" /></div>
      <h2 className="mt-3 text-lg font-semibold text-white">Saghe</h2><p className="mt-1 text-sm leading-5 text-white/65">Ordini di visione, capitoli e storie da completare.</p>
      <span className="mt-3 inline-flex rounded-full border border-amber-200/25 bg-amber-100/10 px-3 py-1 text-xs font-semibold text-amber-100">Esplora le saghe ↗</span>
    </Link>
    <Link href="/collections" className="group relative isolate overflow-hidden rounded-2xl border border-violet-400/30 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,.25),transparent_60%),linear-gradient(125deg,#17102b,#101014_70%)] p-4 shadow-lg transition hover:-translate-y-0.5 hover:border-violet-300/65">
      <div aria-hidden className="absolute -right-4 -top-7 -z-10 size-28 rounded-full border border-violet-200/20 bg-violet-300/5 blur-sm transition group-hover:scale-110" />
      <div className="flex items-center gap-2 text-violet-200"><LibraryBig className="size-5" /><span className="text-xs font-bold tracking-[.2em]">UNIVERSI CURATI</span><Sparkles className="ml-auto size-4 opacity-80" /></div>
      <h2 className="mt-3 text-lg font-semibold text-white">Collezioni</h2><p className="mt-1 text-sm leading-5 text-white/65">Universi condivisi e raccolte tematiche con una coda personale.</p>
      <span className="mt-3 inline-flex rounded-full border border-violet-200/25 bg-violet-100/10 px-3 py-1 text-xs font-semibold text-violet-100">Scopri le collezioni ↗</span>
    </Link>
  </nav>;
}
