"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { GENRES } from "@/domain/genres";
import { BROWSABLE_PROVIDERS, PROVIDERS } from "@/domain/providers";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";

const TYPES = [
  { value: "all", label: "Tutto" },
  { value: "movie", label: "Film" },
  { value: "series", label: "Serie" },
  { value: "anime", label: "Anime" },
] as const;

const SORTS = [
  { value: "popular", label: "Popolari" },
  { value: "top", label: "Più votati" },
  { value: "recent", label: "Novità" },
] as const;

/**
 * Search and filters for Esplora. State lives in the URL, so results are
 * server-rendered, shareable and survive a reload; typing is debounced.
 */
export function ExploreFilters({ q, type, genre, provider, sort }: { q: string; type: string; genre: string; provider: string; sort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const typed = useRef(false);

  // Keep the field in step when the URL changes from elsewhere (back button).
  useEffect(() => {
    if (!typed.current) setText(q);
  }, [q]);

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any change starts the results again from the first page.
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }

  useEffect(() => {
    if (!typed.current || text === q) return;
    const id = window.setTimeout(() => apply({ q: text.trim() }), 350);
    return () => window.clearTimeout(id);
    // `apply` is stable enough for this debounce; re-running on text is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" />
        <label htmlFor="explore-q" className="sr-only">
          Cerca nel catalogo
        </label>
        <input
          id="explore-q"
          type="search"
          value={text}
          onChange={(e) => {
            typed.current = true;
            setText(e.target.value);
          }}
          placeholder="Cerca un film, una serie o un anime…"
          className="h-12 w-full rounded-xl border border-line-strong bg-white/[0.03] pr-10 pl-10 text-[15px] text-fg transition-colors outline-none placeholder:text-fg-3 hover:border-white/20 focus:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/40"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin text-fg-3" />
          ) : (
            text && (
              <button
                type="button"
                onClick={() => {
                  typed.current = true;
                  setText("");
                  apply({ q: "" });
                }}
                aria-label="Cancella la ricerca"
                className="grid size-6 place-items-center rounded-full text-fg-3 hover:bg-white/10 hover:text-fg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            )
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Tipo"
          value={type}
          onChange={(value) => apply({ type: value === "all" ? "" : value })}
          options={TYPES.map((t) => ({ ...t }))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select label="Su" value={provider} onChange={(e) => apply({ on: e.target.value })}>
            <option value="">Ovunque</option>
            {BROWSABLE_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].name}
              </option>
            ))}
          </Select>
          <Select label="Genere" value={genre} onChange={(e) => apply({ genre: e.target.value })}>
            <option value="">Tutti</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          {!q && (
            <Select label="Ordina" value={sort} onChange={(e) => apply({ sort: e.target.value === "popular" ? "" : e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
