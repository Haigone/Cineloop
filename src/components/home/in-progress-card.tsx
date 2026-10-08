import { Play } from "lucide-react";
import type { ContinueItem } from "@/server/services/shared";
import { episodeLabel, percent } from "@/lib/format";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { KeyArt } from "@/components/media/key-art";

/**
 * A smaller rectangle under the hero for the other titles in progress: where
 * you are (episode, or how much of the film) and how far through the series.
 */
export function InProgressCard({ item }: { item: ContinueItem }) {
  const { title, progress, continueUrl, providerName, seriesFraction, live } = item;
  const ep = episodeLabel(progress, "short");
  const fraction = seriesFraction ?? progress.fraction;
  const label = [`Continua ${title.title}`, providerName && `su ${providerName}`, episodeLabel(progress, "long")].filter(Boolean).join(", ");
  const Wrapper = continueUrl ? "a" : "div";

  return (
    <Wrapper
      {...(continueUrl ? { href: continueUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": label } : {})}
      className="group/card flex items-center gap-3 rounded-lg border border-line bg-surface p-2 pr-3 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <KeyArt title={title} variant="backdrop" className="absolute inset-0" />
        {continueUrl && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
            <Play aria-hidden className="size-4 text-white" fill="currentColor" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
          {live && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
          <span className="truncate">{title.title}</span>
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
          <ProviderBadge id={progress.providerId} quiet />
          {ep && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">{ep}</span>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={fraction} label={`Avanzamento ${title.title}`} size="xs" className="flex-1" />
          <span className="text-[11px] tabular text-fg-2">{percent(fraction)}</span>
        </div>
      </div>
    </Wrapper>
  );
}
