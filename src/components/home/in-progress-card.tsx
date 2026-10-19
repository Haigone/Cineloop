import Link from "next/link";
import { Play } from "lucide-react";
import type { ContinueItem } from "@/server/services/shared";
import type { SharedWatchView } from "@/server/services/shared-watch";
import { cn } from "@/lib/cn";
import { TogetherLine } from "./together-line";
import { episodeLabel, percent } from "@/lib/format";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { KeyArt } from "@/components/media/key-art";
import { StopWatching } from "@/components/title/stop-watching";

function workerContinueUrl(titleId: string, titleName: string, sourceUrl: string | null, fraction: number, runtimeMinutes: number, season: number | null, episode: number | null): string {
  const params = new URLSearchParams({ query: titleName });
  if (sourceUrl) {
    try {
      const source = new URL(sourceUrl);
      const host = source.hostname.toLowerCase().replace(/^www\./, "");
      const validHost = source.protocol === "https:" && /^(?:streaming[-]?community[a-z0-9-]*|streamingcommunityz[a-z0-9-]*)\.[a-z]{2,}$/i.test(host);
      const match = validHost && /^\/(?:[a-z]{2}\/)?(?:watch|titles?)\/(\d{1,9})(?:[-/?#]|$)/i.exec(source.pathname);
      if (match) params.set("id", match[1]!);
      const episodeId = source.searchParams.get("e");
      if (episodeId && /^\d{1,12}$/.test(episodeId)) params.set("episodeId", episodeId);
    } catch {}
  }
  if (season !== null) params.set("season", String(season));
  if (episode !== null) params.set("episode", String(episode));
  params.set("minute", String(Math.max(0, Math.floor(fraction * runtimeMinutes))));
  return `https://odd-tree-f5fa.turiscrocca.workers.dev/?${params.toString()}`;
}


/**
 * A smaller rectangle under the hero for the other titles in progress: where
 * you are (episode, or how much of the film) and how far through the series.
 */
export function InProgressCard({ item, together, collection }: { item: ContinueItem; together?: SharedWatchView | null; collection?: { name: string; nextTitle: import("@/domain/types").Title | null } }) {
  const { title, progress, continueUrl, continueOnSite, providerName, seriesFraction, live, editionLabel } = item;
  const ep = episodeLabel(progress, "short");
  // This card's bar represents the current episode (or film), not the whole series.
  const fraction = progress.fraction;
  const destination = progress.providerId === "streamingcommunity"
    ? workerContinueUrl(title.id, title.title, progress.url ?? null, progress.fraction, title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes, title.type === "movie" ? null : (progress.season ?? null), title.type === "movie" ? null : (progress.episode ?? null))
    : continueUrl;
  const label = continueOnSite
    ? [`${title.title}: ${progress.providerId === "streamingcommunity" ? "continua a guardare" : "dove guardarlo"}`, episodeLabel(progress, "long")].filter(Boolean).join(", ")
    : [`Continua ${title.title}`, providerName && `su ${providerName}`, episodeLabel(progress, "long")].filter(Boolean).join(", ");
  // The service in a new tab; with no service known, the title's own page here.
  const Wrapper = continueOnSite ? Link : "a";

  // The card as a whole continues; the title inside opens the title's own page.
  return (
    <div
      className={cn(
        "group/card relative flex items-center gap-3 rounded-lg border p-2 pr-3 transition-colors",
        // Watched together: a violet frame, so it reads as shared at a glance.
        collection ? "border-violet-300/55 bg-[linear-gradient(110deg,rgba(91,33,182,.16),rgba(20,18,28,.98))] shadow-[0_0_22px_rgba(139,92,246,.08)] hover:border-violet-200/80" : together ? "border-violet/55 bg-violet/[0.07] hover:border-violet/80 hover:bg-violet/[0.11]" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
      )}
    >
      <Wrapper
        href={destination ?? `/title/${title.id}`}
        aria-label={label}
        {...(continueOnSite ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        className="absolute inset-0 rounded-lg"
      />
      <div className="pointer-events-none relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <KeyArt title={title} variant="backdrop" className="absolute inset-0" />
        {!continueOnSite && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
            <Play aria-hidden className="size-4 text-white" fill="currentColor" />
          </span>
        )}
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        {collection && <span className="mb-1 inline-flex w-fit rounded-full border border-violet-200/35 bg-violet-950/60 px-2 py-0.5 text-[9px] font-extrabold tracking-[.15em] text-violet-100">COLLEZIONE · {collection.name}</span>}
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
          {live && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
          <Link href={`/title/${title.id}`} className="pointer-events-auto relative z-10 truncate hover:text-accent hover:underline">{title.title}</Link>
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
          <ProviderBadge id={progress.providerId} quiet />
          {ep && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">{ep}</span>
            </>
          )}
          {editionLabel && <><span aria-hidden>·</span><span>{editionLabel}</span></>}
        </div>
        {together && <TogetherLine group={together} />}
        {collection?.nextTitle && <p className="mt-2 truncate text-[11px] font-medium text-violet-200">Dopo: {collection.nextTitle.title}</p>}
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={fraction} label={`Avanzamento ${title.title}`} size="xs" className="flex-1" />
          <span className="text-[11px] tabular text-fg-2">{percent(fraction)}</span>
        </div>
      </div>
      <div className="relative z-10 self-start">
        <StopWatching titleId={title.id} titleName={title.title} compact />
      </div>
    </div>
  );
}

