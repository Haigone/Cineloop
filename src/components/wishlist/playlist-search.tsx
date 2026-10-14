"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Check, Plus, Search } from "lucide-react";
import type { SearchResults } from "@/server/services/search";
import { setInPlaylist } from "@/server/actions/playlists";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TitleThumb } from "./title-thumb";

/** Search the whole catalogue from inside a playlist and add titles to it, wishlist or not. */
export function PlaylistSearch({ playlistId, playlistName, inside }: { playlistId: string; playlistName: string; inside: ReadonlySet<string> }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ q: string; titles: SearchResults["titles"] }>({ q: "", titles: [] });
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
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

  const results = q.length >= 2 && data.q === q ? data.titles.slice(0, 8) : [];

  return (
    <div className="mt-3">
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
        Cerca nel catalogo
      </label>
      <div className="relative mt-1 max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Film, serie o anime da aggiungere"
          className="h-10 w-full rounded-md border border-line-strong bg-surface-2 pr-3 pl-9 text-sm text-fg placeholder:text-fg-3"
        />
      </div>
      {q.length >= 2 && (
        <ul className="mt-2 max-w-md" aria-live="polite" aria-label={`Risultati per ${playlistName}`}>
          {data.q === q && results.length === 0 && <li className="py-3 text-sm text-fg-2">Nessun titolo trovato per “{q}”.</li>}
          {results.map((t) => {
            const already = inside.has(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                <TitleThumb posterUrl={t.posterUrl} palette={t.palette} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{t.title}</span>
                  <span className="block text-xs text-fg-3">
                    {MEDIA_TYPE_LABEL[t.type]} · {t.year}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={already ? "ghost" : "secondary"}
                  disabled={already || pending}
                  loading={adding === t.id}
                  icon={already ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
                  aria-label={already ? `${t.title} è già in ${playlistName}` : `Aggiungi ${t.title} a ${playlistName}`}
                  onClick={() => {
                    setAdding(t.id);
                    startTransition(async () => {
                      const res = await setInPlaylist(playlistId, t.id, true);
                      setAdding(null);
                      if (res.ok) toast.show(`${t.title} aggiunto a ${playlistName}`);
                      else toast.show(res.error, { tone: "error" });
                    });
                  }}
                >
                  {already ? "Già dentro" : "Aggiungi"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
