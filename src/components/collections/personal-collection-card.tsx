import Link from "next/link";
import { Check, Clock3, Layers3, Clapperboard } from "lucide-react";
import type { PersonalLibraryGroup } from "@/server/services/personal-collections";
import { cn } from "@/lib/cn";

export function PersonalCollectionCard({ group }: { group: PersonalLibraryGroup }) {
  const isSaga = group.kind === "saga";
  const label = isSaga ? "SAGA" : "COLLEZIONE";
  const accent = isSaga ? "#f59e0b" : "#a78bfa";
  const image = group.artwork.backdropUrl ?? group.artwork.posterUrl;

  return (
    <article className="group/card min-w-0">
      <Link href={group.href} className="block rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">
        <div
          className="relative isolate aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-[#111018] shadow-soft transition duration-300 group-hover/card:-translate-y-1 group-hover/card:shadow-xl"
          style={{ borderColor: `${accent}55` }}
        >
          {image ? (
            // The artwork is the visual base; gradients, framing and labels make this a dedicated collection cover.
            <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center opacity-75 transition duration-500 group-hover/card:scale-105" style={{ backgroundImage: `url("${image}")` }} />
          ) : (
            <div aria-hidden className="absolute inset-0 -z-20" style={{ background: `radial-gradient(ellipse at 70% 25%, ${group.artwork.palette[0]}, transparent 55%), linear-gradient(145deg, ${group.artwork.palette[1]}, #09090d 75%)` }} />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,.08)_0%,rgba(0,0,0,.15)_32%,rgba(0,0,0,.92)_100%)]" />
          <div aria-hidden className="absolute inset-3 rounded-lg border" style={{ borderColor: `${accent}66` }} />
          <div className="absolute top-5 left-5 right-5 flex items-start justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold tracking-[.13em] text-black shadow-lg" style={{ backgroundColor: accent }}>
              {isSaga ? <Clapperboard className="size-3" /> : <Layers3 className="size-3" />}
              {label}
            </span>
            <span className="rounded-full border border-white/20 bg-black/65 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur">
              {group.total} {group.total === 1 ? "TITOLO" : "TITOLI"}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em]" style={{ color: accent }}>La tua libreria</p>
            <h3 className="line-clamp-3 text-xl font-bold leading-tight tracking-tight text-white drop-shadow sm:text-2xl">{group.name}</h3>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-white/80">
              {group.completed > 0 && <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-emerald-300" /> {group.completed} visti</span>}
              {group.watching > 0 && <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5 text-sky-300" /> {group.watching} in corso</span>}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${group.total ? Math.min(100, group.completed / group.total * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-white/55">{group.completed} di {group.total} completati</p>
          </div>
        </div>
      </Link>
    </article>
  );
}
