"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, Search, X } from "lucide-react";
import type { SearchResults } from "@/server/services/search";
import { cn } from "@/lib/cn";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";

type Option =
  | { kind: "title"; id: string; href: string; label: string; meta: string; posterUrl: string | null; palette: readonly [string, string, string] }
  | { kind: "person"; id: string; href: string; label: string; meta: string };

type Status = "idle" | "loading" | "ready" | "error";

const EMPTY: SearchResults = { titles: [], people: [] };

/**
 * Global search (ARIA combobox). Groups results by kind so people, friends
 * and future result types (cast, lists) slot in without changing behaviour.
 * Press "/" anywhere to focus it.
 */
export function SearchBox({ autoFocus = false, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Results are stored with the query they answer, so loading/idle are derived, not set.
  const [data, setData] = useState<{ q: string; results: SearchResults | null; failed: boolean }>({
    q: "",
    results: null,
    failed: false,
  });
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = query.trim();
  const searchable = trimmed.length >= 2;
  const current = searchable && data.q === trimmed ? data : null;
  const status: Status = !searchable ? "idle" : !current ? "loading" : current.failed ? "error" : "ready";
  const results = current?.results ?? EMPTY;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setData({ q: trimmed, results: (await res.json()) as SearchResults, failed: false });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setData({ q: trimmed, results: null, failed: true });
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, searchable]);

  const options = useMemo<Option[]>(
    () => [
      ...results.titles.map((t) => ({
        kind: "title" as const,
        id: t.id,
        href: `/title/${t.id}`,
        label: t.title,
        meta: `${MEDIA_TYPE_LABEL[t.type]} · ${t.year}`,
        posterUrl: t.posterUrl,
        palette: t.palette,
      })),
      ...results.people.map((p) => ({
        kind: "person" as const,
        id: p.id,
        href: p.isFriend ? `/friends/${p.username}` : `/friends?add=${p.username}`,
        label: p.displayName,
        meta: p.isFriend ? `@${p.username} · amico` : `@${p.username}`,
      })),
    ],
    [results],
  );

  function go(option: Option) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(option.href);
  }

  const showPanel = open && searchable;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Cerca film, serie, anime e persone
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Cerca film, serie, anime..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (e.key === "Enter" && active >= 0 && options[active]) {
            e.preventDefault();
            go(options[active]);
          } else if (e.key === "Escape") {
            if (query) setQuery("");
            else inputRef.current?.blur();
          }
        }}
        className="h-10 w-full rounded-lg border border-line bg-white/[0.035] pr-16 pl-10 text-sm text-fg placeholder:text-fg-3 transition-colors duration-150 outline-none hover:border-line-strong focus:border-white/20 focus:bg-white/[0.06] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1.5">
        {status === "loading" && <LoaderCircle aria-hidden className="size-4 animate-spin text-fg-3" />}
        {query ? (
          <button
            type="button"
            aria-label="Cancella ricerca"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded-sm p-1 text-fg-3 hover:text-fg"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 font-sans text-[11px] text-fg-3 md:inline">/</kbd>
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16 }}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-pop"
          >
            <ul id={listId} role="listbox" aria-label="Risultati della ricerca" className="max-h-[60vh] overflow-y-auto p-1.5">
              {status === "error" && <li className="px-3 py-6 text-center text-sm text-fg-2">La ricerca non risponde. Riprova tra un momento.</li>}
              {status === "ready" && options.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-fg-2">Nessun risultato per “{trimmed}”.</li>
              )}
              {options.map((opt, i) => {
                const firstOfGroup = i === 0 || options[i - 1]!.kind !== opt.kind;
                return (
                  <li key={`${opt.kind}-${opt.id}`} role="none">
                    {firstOfGroup && (
                      <div role="presentation" className="px-2.5 pt-2 pb-1 text-xs text-fg-3">
                        {opt.kind === "title" ? "Titoli" : "Persone"}
                      </div>
                    )}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={active === i}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(opt)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                        active === i ? "bg-white/[0.07]" : "",
                      )}
                    >
                      {opt.kind === "title" ? (
                        <span
                          aria-hidden
                          className="h-10 w-7 shrink-0 rounded-[3px] bg-cover bg-center"
                          style={{
                            backgroundImage: opt.posterUrl
                              ? `url("${opt.posterUrl}")`
                              : `linear-gradient(160deg, ${opt.palette[0]}, ${opt.palette[1]})`,
                          }}
                        />
                      ) : (
                        <Avatar user={{ id: opt.id, displayName: opt.label, avatarUrl: null }} size="sm" decorative />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg">{opt.label}</span>
                        <span className="block truncate text-xs text-fg-3">{opt.meta}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
