"use client";

import { useEffect, useId, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import type { MediaType } from "@/domain/types";
import type { SearchResults } from "@/server/services/search";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TitleThumb } from "@/components/wishlist/title-thumb";

/** What a night needs of a title: enough to list it and paint its slice on the wheel. */
export interface NightTitle {
  id: string;
  title: string;
  year: number;
  type: MediaType;
  palette: readonly [string, string, string];
  posterUrl: string | null;
}

/** Search the whole catalogue (the same search as the top bar) and pick titles for the night. */
export function TitleSearch({ label, placeholder, isIn, onPick, pickLabel = "Aggiungi" }: { label: string; placeholder: string; isIn: (id: string) => boolean; onPick: (t: NightTitle) => void; pickLabel?: string }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ q: string; titles: SearchResults["titles"] }>({ q: "", titles: [] });
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

  const results = q.length >= 2 && data.q === q ? data.titles.slice(0, 8) : [];

  return (
    <div>
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      <div className="relative mt-1 max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-line-strong bg-surface-2 pr-3 pl-9 text-sm text-fg placeholder:text-fg-3"
        />
      </div>
      {q.length >= 2 && (
        <ul className="mt-2 max-w-md" aria-live="polite" aria-label={`Risultati per “${q}”`}>
          {data.q === q && results.length === 0 && <li className="py-3 text-sm text-fg-2">Nessun titolo trovato per “{q}”.</li>}
          {results.map((t) => {
            const already = isIn(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                <TitleThumb posterUrl={t.posterUrl} palette={t.palette} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{t.title}</span>
                  <span className="block text-xs text-fg-3">
                    {MEDIA_TYPE_LABEL[t.section]} · {t.year}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={already ? "ghost" : "secondary"}
                  disabled={already}
                  icon={already ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
                  aria-label={already ? `${t.title} è già nella serata` : `${pickLabel} ${t.title}`}
                  onClick={() => onPick({ id: t.id, title: t.title, year: t.year, type: t.section, palette: t.palette, posterUrl: t.posterUrl })}
                >
                  {already ? "Già scelto" : pickLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
