"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { MediaType } from "@/domain/types";
import type { BackgroundChoice } from "@/server/services/settings";
import type { SearchResults } from "@/server/services/search";
import { setHomeBackground } from "@/server/actions/settings";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";
import { TitleThumb } from "@/components/wishlist/title-thumb";

const LABEL: Record<MediaType, string> = { movie: "Film", series: "Serie TV", anime: "Anime" };

/**
 * One background per Home section: a title from the user's rankings (podium and best rated), any other
 * title found with the search under the menu, or the last one watched there.
 */
export function BackgroundPicker({ choices }: { choices: BackgroundChoice[] }) {
  return (
    <ul className="divide-y divide-line">
      {choices.map((c) => (
        <BackgroundRow key={c.category} choice={c} />
      ))}
    </ul>
  );
}

function BackgroundRow({ choice }: { choice: BackgroundChoice }) {
  const [value, setValue] = useState(choice.chosen ?? "");
  // A title picked from the search, shown in the menu until the page comes back with it.
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const ranked = [...choice.podium, ...choice.rated];
  const known = [...ranked, ...(choice.chosenTitle ? [choice.chosenTitle] : [])];
  const shown = known.find((t) => t.id === value) ?? (value ? null : choice.fallback);
  const other = value && !ranked.some((t) => t.id === value) ? (choice.chosenTitle?.id === value ? choice.chosenTitle : picked?.id === value ? picked : null) : null;

  function change(next: string) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setHomeBackground(choice.category, next || null);
      if (res.ok) toast.show(`Sfondo di ${LABEL[choice.category]} salvato`, { tone: "success" });
      else {
        setValue(previous);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="aspect-video w-[132px] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
        {shown && <KeyArt key={shown.id} title={shown} variant="backdrop" sizes="132px" className="size-full" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{LABEL[choice.category]}</p>
        <p className="mt-0.5 text-[13px] text-fg-3">
          {value ? "Scelto da te." : choice.fallback ? `Automatico: l'ultimo visto, ${choice.fallback.title}.` : "Automatico: l'ultimo visto. Non ne hai ancora."}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-64">
        <Select id={`background-${choice.category}`} label={`Sfondo ${LABEL[choice.category]}`} className="[&>label]:sr-only [&>span]:w-full [&_select]:w-full" value={value} onChange={(e) => change(e.target.value)}>
          <option value="">L&apos;ultimo visto</option>
          {other && <option value={other.id}>{other.title}</option>}
          {choice.podium.length > 0 && (
            <optgroup label="Il tuo podio">
              {choice.podium.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
          {choice.rated.length > 0 && (
            <optgroup label="I tuoi voti più alti">
              {choice.rated.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        <BackgroundSearch
          category={choice.category}
          onPick={(t) => {
            setPicked(t);
            change(t.id);
          }}
        />
      </div>
    </li>
  );
}

/** Any other title of the section from the whole catalogue: a few results, never a long menu. */
function BackgroundSearch({ category, onPick }: { category: MediaType; onPick: (t: { id: string; title: string }) => void }) {
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

  const results = q.length >= 2 && data.q === q ? data.titles.filter((t) => t.section === category).slice(0, 5) : [];

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Cerca un altro titolo per lo sfondo di {LABEL[category]}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un altro titolo"
          className="h-8 w-full rounded-md border border-line-strong bg-white/[0.03] pr-3 pl-8 text-[13px] text-fg placeholder:text-fg-3"
        />
      </div>
      {q.length >= 2 && data.q === q && (
        <ul className="mt-1 rounded-md border border-line bg-surface-2" aria-live="polite" aria-label={`Risultati per lo sfondo di ${LABEL[category]}`}>
          {results.length === 0 && <li className="px-3 py-2 text-[13px] text-fg-2">Nessun titolo di {LABEL[category]} per “{q}”.</li>}
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.04] focus-visible:bg-white/[0.04]"
                onClick={() => {
                  onPick({ id: t.id, title: t.title });
                  setQuery("");
                }}
              >
                <TitleThumb posterUrl={t.posterUrl} palette={t.palette} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{t.title}</span>
                  <span className="block text-xs text-fg-3">{t.year}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
