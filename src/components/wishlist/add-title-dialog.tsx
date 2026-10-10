"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plus, Search } from "lucide-react";
import Image from "next/image";
import type { SearchResults } from "@/server/services/search";
import { setWishlisted } from "@/server/actions/library";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Search the catalog and add titles to the wishlist without leaving the page. */
export function AddTitleDialog({ open, onClose, existingIds }: { open: boolean; onClose: () => void; existingIds: Set<string> }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ q: string; titles: SearchResults["titles"] }>({ q: "", titles: [] });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setData({ q, titles: ((await res.json()) as SearchResults).titles });
      } catch {
        /* aborted or offline: keep the previous results */
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const results = q.length >= 2 && data.q === q ? data.titles : [];

  return (
    <Modal open={open} onClose={onClose} title="Aggiungi alla wishlist" description="Cerca un film, una serie o un anime.">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
        <label htmlFor="wishlist-search" className="sr-only">
          Cerca un titolo
        </label>
        <input
          id="wishlist-search"
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Es. Dune, Frieren…"
          className="h-11 w-full rounded-md border border-line-strong bg-white/[0.03] pr-3 pl-9 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/40"
        />
      </div>
      <ul className="mt-3 flex min-h-24 flex-col" aria-live="polite">
        {q.length >= 2 && data.q === q && results.length === 0 && (
          <li className="py-6 text-center text-sm text-fg-2">Nessun titolo trovato per “{q}”.</li>
        )}
        {results.map((t) => {
          const inList = existingIds.has(t.id) || added.has(t.id);
          return (
            <li key={t.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span aria-hidden className="relative h-12 w-8 shrink-0 overflow-hidden rounded-[3px]" style={{ background: `linear-gradient(160deg, ${t.palette[0]}, ${t.palette[1]})` }}>
                {t.posterUrl && <Image src={t.posterUrl} alt="" fill sizes="32px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{t.title}</span>
                <span className="block text-xs text-fg-3">
                  {MEDIA_TYPE_LABEL[t.type]} · {t.year}
                </span>
              </span>
              <Button
                size="sm"
                variant={inList ? "ghost" : "secondary"}
                disabled={inList || pending}
                icon={inList ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
                aria-label={inList ? `${t.title} è già nella wishlist` : `Aggiungi ${t.title}`}
                onClick={() =>
                  startTransition(async () => {
                    const res = await setWishlisted(t.id, true);
                    if (res.ok) {
                      setAdded((s) => new Set(s).add(t.id));
                      toast.show(`${t.title} aggiunto alla wishlist`);
                    } else toast.show(res.error, { tone: "error" });
                  })
                }
              >
                {inList ? "Aggiunto" : "Aggiungi"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
