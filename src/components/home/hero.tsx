"use client";

import { motion } from "motion/react";
import { MapPin, Play } from "lucide-react";
import type { ContinueItem } from "@/server/services/shared";
import { episodeLabel, formatDuration, percent } from "@/lib/format";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { KeyArt } from "@/components/media/key-art";
import { ProgressEditor } from "@/components/title/progress-editor";

/**
 * What is playing now (reported by the extension) or, failing that, the last
 * title opened: the single most important thing on Home. CineLoop does
 * not play anything; the primary action hands the user back to the provider.
 */
export function Hero({ item }: { item: ContinueItem }) {
  const { title, progress, providerName, continueUrl, continueOnSite, live, seriesFraction, seasonEpisodes } = item;
  const ep = episodeLabel(progress);
  const runtime = title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes;
  const remaining = Math.max(1, Math.round(runtime * (1 - progress.fraction)));

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden rounded-xl border border-line bg-surface">
      <motion.div
        className="absolute inset-0 -z-10"
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <KeyArt title={title} variant="backdrop" priority className="absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#08090d_0%,rgb(8_9_13/0.88)_32%,rgb(8_9_13/0.35)_62%,rgb(8_9_13/0.1)_100%)] max-md:bg-[linear-gradient(0deg,#08090d_10%,rgb(8_9_13/0.7)_55%,rgb(8_9_13/0.2))]" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(0deg,rgb(8_9_13/0.7),transparent)]" />
      </motion.div>

      {providerName && (
        <span className="absolute top-4 right-4 hidden rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-fg backdrop-blur-md sm:block">
          {providerName}
        </span>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-[340px] flex-col justify-end px-5 pt-32 pb-6 sm:px-8 sm:pb-8 md:min-h-[400px] md:max-w-[560px] md:justify-center md:pt-10 xl:min-h-[420px]"
      >
        <p className="inline-flex items-center gap-2 text-[13px] text-fg-2">
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />}
            <span className={`relative inline-flex size-2 rounded-full ${live ? "bg-accent" : "bg-fg-3"}`} />
          </span>
          {live ? "Ora in visione" : "L’ultimo che hai aperto"}
        </p>
        <h2 id="hero-title" className="mt-3 text-[34px] leading-[1.02] font-semibold tracking-[-0.035em] text-fg [text-wrap:balance] sm:text-[44px] xl:text-[52px]">
          {title.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
          <ProviderBadge id={progress.providerId} />
          {ep && <span className="text-fg">{ep}</span>}
          {seasonEpisodes && progress.episode && <span>di {seasonEpisodes}</span>}
        </div>
        <p className="mt-3 line-clamp-2 max-w-[48ch] text-sm leading-relaxed text-fg-2 max-sm:hidden">{title.overview}</p>

        <div className="mt-5 max-w-[420px]">
          <ProgressBar value={progress.fraction} label={`Avanzamento di ${title.title}`} />
          <div className="mt-2 flex justify-between text-xs tabular text-fg-3">
            <span>{percent(progress.fraction)} {title.type === "movie" ? "visto" : "dell’episodio"}</span>
            <span>Mancano {formatDuration(remaining)}</span>
          </div>
          {seriesFraction !== null && (
            <div className="mt-3">
              <ProgressBar value={seriesFraction} label={`Avanzamento nella serie ${title.title}`} size="xs" />
              <p className="mt-1.5 text-xs tabular text-fg-3">{percent(seriesFraction)} della serie</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {continueUrl && continueOnSite ? (
            // No service known for this title: its page says where it streams.
            <ButtonLink href={continueUrl} size="lg" icon={<MapPin aria-hidden className="size-4" />}>
              Dove guardarlo
            </ButtonLink>
          ) : continueUrl ? (
            <ButtonAnchor href={continueUrl} size="lg" icon={<Play aria-hidden className="size-4" fill="currentColor" />}>
              {providerName ? `Continua su ${providerName}` : "Continua"}
            </ButtonAnchor>
          ) : null}
          <ProgressEditor title={title} progress={progress} size="lg" />
        </div>
      </motion.div>
    </section>
  );
}
