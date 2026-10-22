"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { moveInOrder } from "@/domain/collections";
import type { Title, WatchStatus } from "@/domain/types";
import { setSagaFilmIncluded, setSagaOrder } from "@/server/actions/collections";
import { KeyArt } from "@/components/media/key-art";
import { ReleaseTimer } from "@/components/media/release-timer";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export interface SagaFilmRow {
  film: Title;
  releaseDate: string | null;
  released: boolean;
  status: WatchStatus | null;
}

const STATUS: Partial<Record<WatchStatus, string>> = { completed: "Visto", watching: "In corso", dropped: "Abbandonato" };

/**
 * A saga's films in the viewer's watching order. Arrows move a film, the
 * switch leaves it out: what is off does not count for "saga finita" and is
 * never suggested as the next one. Films not out yet show the time left.
 */
export function SagaOrder({
  collectionId,
  rows,
  excluded,
  customOrder,
  currentId,
  nextId,
}: {
  collectionId: string;
  rows: SagaFilmRow[];
  excluded: string[];
  customOrder: boolean;
  /** The film whose page this is. */
  currentId: string;
  /** The first film to watch, when the saga is started. */
  nextId: string | null;
}) {
  const [order, setOrder] = useState(rows.map((r) => r.film.id));
  const [off, setOff] = useState(new Set(excluded));
  const [custom, setCustom] = useState(customOrder);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const byId = new Map(rows.map((r) => [r.film.id, r]));

  function save(action: () => Promise<{ ok: boolean; error?: string }>, undo: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        undo();
        toast.show(res.error ?? "Non siamo riusciti a salvare la scelta.", { tone: "error" });
      }
    });
  }

  function move(id: string, delta: -1 | 1) {
    const before = order;
    const wasCustom = custom;
    const next = moveInOrder(order, id, delta);
    setOrder(next);
    setCustom(true);
    save(() => setSagaOrder(collectionId, next), () => {
      setOrder(before);
      setCustom(wasCustom);
    });
  }

  function reset() {
    const before = order;
    // Release order is the order the page was rendered with before any choice: the catalogue's.
    const byRelease = [...rows].sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999")).map((r) => r.film.id);
    setOrder(byRelease);
    setCustom(false);
    save(() => setSagaOrder(collectionId, null), () => {
      setOrder(before);
      setCustom(true);
    });
  }

  function include(id: string, on: boolean) {
    const before = off;
    const next = new Set(off);
    if (on) next.delete(id);
    else next.add(id);
    setOff(next);
    save(() => setSagaFilmIncluded(collectionId, id, on), () => setOff(before));
  }

  return (
    <div>
      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {order.map((id, i) => {
          const row = byId.get(id);
          if (!row) return null;
          const { film } = row;
          const on = !off.has(id);
          const labelId = `saga-${id}`;
          const meta = [film.year ? String(film.year) : null, row.status ? STATUS[row.status] : null, id === nextId && on ? "Il prossimo da vedere" : null].filter(Boolean).join(" · ");
          return (
            <li key={id} className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", id === currentId && "bg-white/[0.03]")}>
              <span aria-hidden className="w-5 shrink-0 text-center text-sm tabular text-fg-3">
                {i + 1}
              </span>
              <Link href={`/title/${id}`} className="shrink-0 rounded-md" tabIndex={-1} aria-hidden>
                <KeyArt title={film} variant="poster" className="aspect-[2/3] w-9 rounded-md border border-line" />
              </Link>
              <div className={cn("min-w-0 flex-1", !on && "opacity-60")}>
                <p id={labelId} className="truncate text-sm font-medium">
                  {id === currentId ? (
                    <span aria-current="page">{film.title}</span>
                  ) : (
                    <Link href={`/title/${id}`} className="rounded-sm hover:underline hover:underline-offset-4">
                      {film.title}
                    </Link>
                  )}
                </p>
                {meta && <p className="mt-0.5 truncate text-xs text-fg-3">{meta}</p>}
                {!row.released && <ReleaseTimer className="mt-1.5" date={row.releaseDate} />}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                {row.status === "completed" && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="size-4" /><span className="hidden sm:inline">Visto</span></span>}
                {row.status === "watching" && <span className="inline-flex items-center gap-1 text-sky-300"><Clock3 className="size-4" /><span className="hidden sm:inline">In corso</span></span>}
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton size="sm" label={`Sposta ${film.title} prima`} icon={<ChevronUp aria-hidden className="size-4" />} disabled={i === 0} onClick={() => move(id, -1)} />
                <IconButton size="sm" label={`Sposta ${film.title} dopo`} icon={<ChevronDown aria-hidden className="size-4" />} disabled={i === order.length - 1} onClick={() => move(id, 1)} />
              </div>
              <Switch checked={on} onChange={(v) => include(id, v)} labelledBy={labelId} />
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-3">
          Quello che è spento non conta per finire la saga e non ti viene ricordato. Film e date vengono da TMDB.
        </p>
        {custom && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Torna all’ordine di uscita
          </Button>
        )}
      </div>
    </div>
  );
}
