"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { RatingValue, Title } from "@/domain/types";
import { savePodium } from "@/server/actions/library";
import { searchKey } from "@/lib/text";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RatingStars } from "@/components/ui/rating-stars";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";

type Pick = { title: Title; rating: RatingValue | null };

/** Medal tints and pedestal heights, by place. */
const PLACES = [
  { place: 1, tint: "#e3b341", step: "h-24 sm:h-28" },
  { place: 2, tint: "#b8c0cc", step: "h-16 sm:h-20" },
  { place: 3, tint: "#c98a5a", step: "h-10 sm:h-14" },
] as const;
/** Second, first, third: the winner stands in the middle. */
const VISUAL_ORDER = [1, 0, 2];

/** The viewer's own top 3, chosen by hand, shown as a podium. */
export function Podium({ picks, candidates }: { picks: Pick[]; candidates: Pick[] }) {
  const [open, setOpen] = useState(false);
  const empty = picks.length === 0;

  return (
    <section aria-labelledby="podium-h" className="rounded-xl border border-line bg-surface px-4 pt-5 pb-0 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="podium-h" className="text-[17px] font-semibold tracking-[-0.01em] text-fg">
            Il tuo podio
          </h2>
          <p className="mt-1 text-sm text-fg-2">I tre titoli che ti sono piaciuti di più, scelti da te.</p>
        </div>
        <Button
          variant={empty ? "primary" : "secondary"}
          size="sm"
          icon={empty ? <Plus aria-hidden className="size-4" /> : <Pencil aria-hidden className="size-3.5" />}
          onClick={() => setOpen(true)}
          disabled={candidates.length === 0}
        >
          {empty ? "Scegli i tuoi 3" : "Cambia il podio"}
        </Button>
      </div>

      <ol className="mx-auto mt-6 grid max-w-[560px] grid-cols-3 items-end gap-3 sm:gap-5">
        {VISUAL_ORDER.map((i) => {
          const pick = picks[i];
          const { place, tint, step } = PLACES[i]!;
          return (
            <li key={place} className="flex min-w-0 flex-col items-center" style={{ order: VISUAL_ORDER.indexOf(i) }} aria-label={`${place}° posto${pick ? `: ${pick.title.title}` : ", libero"}`}>
              {pick ? (
                <Link href={`/title/${pick.title.id}`} aria-label={pick.title.title} className={cn("block w-full rounded-lg outline-offset-4", place === 1 ? "max-w-[150px]" : "max-w-[124px]")}>
                  <KeyArt title={pick.title} variant="poster" className="aspect-[2/3] w-full rounded-lg border border-line shadow-soft" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  disabled={candidates.length === 0}
                  className={cn(
                    "grid aspect-[2/3] w-full place-items-center rounded-lg border border-dashed border-line-strong text-fg-3 transition-colors hover:border-white/30 hover:text-fg",
                    place === 1 ? "max-w-[150px]" : "max-w-[124px]",
                  )}
                >
                  <Plus aria-hidden className="size-5" />
                  <span className="sr-only">Scegli il {place}° posto</span>
                </button>
              )}
              <div className="mt-2 h-10 w-full px-0.5 text-center">
                {pick && (
                  <>
                    <p className="truncate text-[13px] font-medium text-fg">{pick.title.title}</p>
                    {pick.rating && <RatingStars value={pick.rating} size="xs" className="mt-0.5 justify-center" />}
                  </>
                )}
              </div>
              <div
                aria-hidden
                className={cn("mt-2 grid w-full place-items-start justify-center rounded-t-md border border-b-0 border-line pt-2", step)}
                style={{ background: `linear-gradient(180deg, ${tint}2e, ${tint}08)` }}
              >
                <span className="text-xl font-semibold tabular" style={{ color: tint }}>
                  {place}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <PodiumEditor key={String(open)} open={open} onClose={() => setOpen(false)} initial={picks.map((p) => p.title.id)} candidates={candidates} />
    </section>
  );
}

function PodiumEditor({ open, onClose, initial, candidates }: { open: boolean; onClose: () => void; initial: string[]; candidates: Pick[] }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const byId = useMemo(() => new Map(candidates.map((c) => [c.title.id, c])), [candidates]);
  const shown = useMemo(() => {
    const q = searchKey(query);
    return q ? candidates.filter((c) => searchKey(c.title.title).includes(q)) : candidates;
  }, [candidates, query]);

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev));
  }

  function save() {
    startTransition(async () => {
      const res = await savePodium(chosen);
      if (res.ok) {
        toast.show("Podio salvato", { tone: "success" });
        onClose();
      } else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Il tuo podio"
      description="Tocca i titoli nell'ordine: il primo che scegli va sul gradino più alto."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} loading={pending}>
            Salva il podio
          </Button>
        </>
      }
    >
      <ol className="mb-4 grid grid-cols-3 gap-2" aria-label="Posti scelti">
        {[0, 1, 2].map((i) => {
          const pick = chosen[i] ? byId.get(chosen[i]!) : undefined;
          return (
            <li key={i} className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-white/[0.03] px-2 py-1.5">
              <span className="text-sm font-semibold tabular" style={{ color: PLACES[i]!.tint }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{pick?.title.title ?? "—"}</span>
              {pick && (
                <button type="button" onClick={() => toggle(pick.title.id)} className="grid size-5 place-items-center rounded text-fg-3 hover:text-fg" aria-label={`Togli ${pick.title.title} dal podio`}>
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <label htmlFor="podium-q" className="sr-only">
        Cerca tra i titoli che hai visto
      </label>
      <input
        id="podium-q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca tra quelli che hai visto…"
        className="mb-2 h-10 w-full rounded-md border border-line-strong bg-white/[0.03] px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:outline-2 focus-visible:outline-white/40"
      />
      <ul className="-mx-2 max-h-[320px] overflow-y-auto">
        {shown.map((c) => {
          const place = chosen.indexOf(c.title.id);
          const full = chosen.length >= 3 && place === -1;
          return (
            <li key={c.title.id}>
              <button
                type="button"
                aria-pressed={place !== -1}
                disabled={full}
                onClick={() => toggle(c.title.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05] disabled:opacity-40"
              >
                <KeyArt title={c.title} variant="poster" className="aspect-[2/3] w-7 shrink-0 rounded-[3px]" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.title.title}</span>
                {c.rating && <RatingStars value={c.rating} size="xs" />}
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular",
                    place === -1 ? "border-line-strong text-transparent" : "border-transparent text-bg",
                  )}
                  style={place === -1 ? undefined : { background: PLACES[place]!.tint }}
                >
                  {place === -1 ? "" : place + 1}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-4 text-sm text-fg-2">Nessun titolo visto con questo nome.</li>}
      </ul>
    </Modal>
  );
}
