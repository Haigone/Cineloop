import { Play } from "lucide-react";
import type { ContinueItem } from "@/server/services/shared";
import { episodeLabel, percent } from "@/lib/format";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { KeyArt } from "./key-art";

/**
 * Landscape card for something in progress. The whole card is the
 * "continue" link; hover and keyboard focus reveal the same overlay.
 */
export function ContinueWatchingCard({ item }: { item: ContinueItem }) {
  const { title, progress, continueUrl, providerName } = item;
  const ep = episodeLabel(progress, "short");
  const label = [`Continua ${title.title}`, providerName && `su ${providerName}`, episodeLabel(progress)].filter(Boolean).join(", ");
  const Wrapper = continueUrl ? "a" : "div";

  return (
    <article className="group/card relative w-[260px] shrink-0 sm:w-[280px]">
      <Wrapper
        {...(continueUrl ? { href: continueUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": label } : {})}
        className="block rounded-lg outline-offset-4"
      >
        <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-surface-2 shadow-soft transition-transform duration-300 ease-out-soft group-hover/card:scale-[1.03] group-focus-within/card:scale-[1.03]">
          <KeyArt title={title} variant="backdrop" className="absolute inset-0 transition-transform duration-500 ease-out-soft group-hover/card:scale-[1.04]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgb(8_9_13/0.85),transparent_55%)]" />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 group-focus-within/card:opacity-100">
            {continueUrl && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-bg shadow-pop">
                <Play aria-hidden className="size-3.5" fill="currentColor" />
                Continua
              </span>
            )}
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
            <ProgressBar value={progress.fraction} label={`Avanzamento ${title.title}`} size="xs" className="flex-1" />
            <span className="text-[11px] tabular text-fg-2">{percent(progress.fraction)}</span>
          </div>
        </div>
      </Wrapper>
      <div className="mt-2.5 px-0.5">
        <h3 className="truncate text-sm font-medium text-fg">{title.title}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-3">
          <ProviderBadge id={progress.providerId} quiet />
          {ep && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">{ep}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
