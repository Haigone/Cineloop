"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SeasonSummary } from "@/domain/types";
import type { EpisodeInfo } from "@/integrations/catalog/types";
import { loadEpisodes } from "@/server/actions/library";
import { cn } from "@/lib/cn";

const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * "Stagioni ed episodi": every season with its episode count; opening one
 * lists its episodes, with where the viewer is marked.
 */
export function SeasonList({
  titleId,
  seasons,
  at,
  seenThrough,
}: {
  titleId: string;
  seasons: SeasonSummary[];
  /** Where the viewer is, if watching. */
  at: { season: number | null; episode: number | null } | null;
  seenThrough: number | null;
}) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {seasons.map((s) => (
        <SeasonRow key={s.number} titleId={titleId} season={s} at={at?.season === s.number ? at.episode : null} seen={seenThrough !== null && s.number <= seenThrough} />
      ))}
    </ul>
  );
}

function SeasonRow({ titleId, season, at, seen }: { titleId: string; season: SeasonSummary; at: number | null; seen: boolean }) {
  const [open, setOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeInfo[] | null | "loading">(null);
  const panel = `season-${season.number}-episodes`;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && episodes === null) {
      setEpisodes("loading");
      loadEpisodes(titleId, season.number)
        .then((list) => setEpisodes(list ?? []))
        .catch(() => setEpisodes([]));
    }
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-fg">
            Stagione {season.number}
            {season.name && <span className="text-fg-2"> · {season.name}</span>}
          </span>
          <span className="block text-xs text-fg-3">
            {season.episodeCount === 1 ? "1 episodio" : `${season.episodeCount} episodi`}
            {season.airDate && ` · ${season.airDate.slice(0, 4)}`}
            {at !== null ? " · ci sei arrivato" : seen ? " · vista" : ""}
          </span>
        </span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panel} className="border-t border-line px-4 py-2">
          {episodes === "loading" || episodes === null ? (
            <p className="py-2 text-sm text-fg-3">Carico gli episodi…</p>
          ) : episodes.length === 0 ? (
            <p className="py-2 text-sm text-fg-3">Il catalogo non elenca gli episodi di questa stagione.</p>
          ) : (
            <ol className="flex flex-col">
              {episodes.map((e) => (
                <li key={e.number} className={cn("flex items-baseline gap-3 py-1.5 text-sm", e.number === at ? "text-fg" : "text-fg-2")}>
                  <span className="w-8 shrink-0 text-xs text-fg-3 tabular">{e.number}</span>
                  <span className="min-w-0 flex-1 truncate">{e.name ?? `Episodio ${e.number}`}</span>
                  {e.number === at && <span className="shrink-0 rounded-md bg-accent-fill px-1.5 py-0.5 text-[11px] font-semibold text-white">Sei qui</span>}
                  {e.airDate && <span className="shrink-0 text-xs text-fg-3 tabular max-sm:hidden">{day.format(new Date(e.airDate))}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
