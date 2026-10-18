import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { migrateAnimeTitle } from "@/server/services/anime-migration";
import { retireDuplicate } from "@/server/services/duplicates";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { STATUS_LABEL } from "@/domain/library";
import { sectionOf } from "@/domain/types";
import { getTitleView } from "@/server/services/library";
import { episodeLabel, firstName, percent, titleMeta } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingStars } from "@/components/ui/rating-stars";
import { ReleaseTimer } from "@/components/media/release-timer";
import { italianDay } from "@/lib/dates";
import { KeyArt } from "@/components/media/key-art";
import { TitleActions } from "@/components/title/title-actions";
import { ReZeroVersionChooser } from "@/components/title/rezero-version-chooser";
import { WatchSourceChooser } from "@/components/title/watch-source-chooser";
import { SuggestDialog } from "@/components/title/suggest-dialog";
import { SharedWatchPanel } from "@/components/title/shared-watch-panel";
import { StopWatching } from "@/components/title/stop-watching";
import { ProgressEditor } from "@/components/title/progress-editor";
import { NewsRestore } from "@/components/title/news-restore";
import { SeasonList } from "@/components/title/season-list";
import { WatchOrder } from "@/components/title/watch-order";
import { SagaSection } from "@/components/title/saga-section";
import { FillerGuide } from "@/components/title/filler-guide";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { MainCast } from "@/components/title/main-cast";

export const metadata: Metadata = { title: "Titolo" };

/** Build a CineLoop destination for every provider button, with resume metadata when known. */
function siteWatchUrl(
  titleId: string,
  titleName: string,
  providerId: string,
  sourceUrl: string | null,
  fraction: number,
  runtimeMinutes: number,
  season: number | null,
  episode: number | null,
): string {
  // The Worker is a placeholder destination for every title. Send a title query
  // when no observed provider ID exists; otherwise pass the observed ID as diagnostics.
  if (providerId === "streamingcommunity") {
    const params = new URLSearchParams({ query: titleName });
    if (sourceUrl) {
      try {
        const source = new URL(sourceUrl);
        const host = source.hostname.toLowerCase().replace(/^www\./, "");
        const validHost = source.protocol === "https:" &&
          /^(?:streaming[-]?community[a-z0-9-]*|streamingcommunityz[a-z0-9-]*)\.[a-z]{2,}$/i.test(host);
        const match = validHost && /^\/(?:[a-z]{2}\/)?(?:watch|titles?)\/(\d{1,9})(?:[-/?#]|$)/i.exec(source.pathname);
        if (match) params.set("id", match[1]!);
        const episodeId = source.searchParams.get("e");
        if (episodeId && /^\d{1,12}$/.test(episodeId)) params.set("episodeId", episodeId);
      } catch {
        // Keep the title-only query when the saved URL is invalid.
      }
    }
    if (season !== null) params.set("season", String(season));
    if (episode !== null) params.set("episode", String(episode));
    params.set("minute", String(Math.max(0, Math.floor(fraction * runtimeMinutes))));
    return `https://odd-tree-f5fa.turiscrocca.workers.dev/?${params.toString()}`;
  }

  const params = new URLSearchParams({
    provider: providerId,
    watching: "true",
    title: titleName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    minute: String(Math.max(0, Math.floor(fraction * runtimeMinutes))),
  });
  if (season !== null) params.set("season", String(season));
  if (episode !== null) params.set("episode", String(episode));
  return `/title/${encodeURIComponent(titleId)}?${params.toString()}`;
}
/**
 * "Da dove lo stai guardando?" now lives in "A che punto sei?" ("Dove lo guardi"). The standalone box is kept in the code, off,
 * so it can be turned back on here.
 */
const SHOW_SOURCE_CHOOSER = false;

export default function TitlePage({ params }: PageProps<"/title/[id]">) {
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Caricamento del titolo">
          <Skeleton className="h-72 rounded-xl" />
        </LoadingRegion>
      }
    >
      <TitleContent params={params} />
    </Suspense>
  );
}

async function TitleContent({ params }: { params: PageProps<"/title/[id]">["params"] }) {
  const { id } = await params;
  // A duplicate of another title opens the one kept in its place, with what was saved on it.
  const kept = await retireDuplicate(id);
  if (kept) redirect(`/title/${kept}`);
  // An anime that still has its TMDB id moves to its franchise card (for everyone) and the page follows.
  const moved = await migrateAnimeTitle(id);
  if (moved) redirect(`/title/${moved}`);
  const view = await getTitleView(id);
  if (!view) notFound();
  const { title, entry, providers, friends, watchChoices } = view;
  const reZeroOverrides = entry?.partOverrides ?? {};
  const selectedReZeroVersion = reZeroOverrides["rezero-directors-cut"] === true
    ? "directors-cut"
    : reZeroOverrides["rezero-original-2016"] === true
      ? "2016"
      : typeof reZeroOverrides["rezero-version"] === "boolean"
        ? reZeroOverrides["rezero-version"] ? "directors-cut" : "2016"
        : null;
  // The observed provider URL is authoritative for the edition actually being watched.
  const progressUrl = entry?.progress?.url ?? "";
  const progressEdition = progressUrl.includes("/anime/48-rezero-starting-life-in-another-world/")
    ? "2016"
    : /shin-henshuu-ban/i.test(progressUrl)
      ? "directors-cut"
      : selectedReZeroVersion;

  return (
    <article>
      <div className="relative isolate -mx-4 -mt-6 overflow-hidden md:mx-0 md:mt-0 md:rounded-xl md:border md:border-line">
        <KeyArt title={title} variant="backdrop" priority className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,#08090d_8%,rgb(8_9_13/0.6)_60%,rgb(8_9_13/0.25))]" />
        <div className="flex flex-col gap-6 px-4 pt-28 pb-8 sm:flex-row sm:items-end sm:px-8 md:pt-40">
          <KeyArt title={title} variant="poster" showTitle className="hidden aspect-[2/3] w-40 shrink-0 rounded-lg border border-line-strong shadow-pop sm:block" />
          <div className="min-w-0">
            <p className="text-[13px] text-fg-2">{titleMeta(title)}</p>
            <h1 className="mt-2 text-[32px] leading-[1.05] font-semibold tracking-[-0.03em] [text-wrap:balance] sm:text-[44px]">{title.title}</h1>
            <p className="mt-2 text-sm text-fg-2">{title.genres.join(", ")}</p>
            {view.awaited && <ReleaseTimer className="mt-3" date={view.awaited.date} season={view.awaited.season} episode={view.awaited.episode} />}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <p className="max-w-[68ch] text-[15px] leading-relaxed text-fg-2">{title.overview}</p>

          <section aria-labelledby="progress-h" className="max-w-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="progress-h" className="text-[15px] font-semibold">
                Dove sei arrivato
              </h2>
              <div className="flex items-center gap-2">
                {entry?.status === "watching" && <StopWatching titleId={title.id} titleName={title.title} />}
                <ProgressEditor
                  title={title}
                  progress={entry?.progress ?? null}
                  seenThrough={entry?.seenThrough ?? null}
                  rezeroVersion={selectedReZeroVersion}
                />
              </div>
            </div>
            {entry?.progress ? (
              <>
                <p className="mt-1 text-sm text-fg-2">{entry.partOverrides?.["rezero-version"] === true && entry.progress.providerId === "animeunity" && /shin[-_ ]henshuu-ban/i.test(entry.progress.url ?? "") ? `Director’s Cut · ${episodeLabel(entry.progress) ?? "In corso"}` : episodeLabel(entry.progress) ?? "In corso"}</p>
                <ProgressBar className="mt-3" value={entry.progress.fraction} label={`Avanzamento di ${title.title}`} />
                <p className="mt-1.5 text-xs text-fg-3 tabular">{percent(entry.progress.fraction)} visto</p>
              </>
            ) : entry?.status === "completed" && entry.seenThrough != null ? (
              <p className="mt-1 text-sm text-fg-2">Vista fino alla stagione {entry.seenThrough}.</p>
            ) : (
              <p className="mt-1 text-sm text-fg-2">Lo guardi fuori da Netflix? Segna qui il punto, lo ritrovi in Home su ogni dispositivo.</p>
            )}
            {title.type !== "movie" && entry?.updates && entry.updates !== "all" && <NewsRestore titleId={title.id} titleName={title.title} updates={entry.updates} />}
            <div aria-labelledby="where-h" role="group" className="mt-5 border-t border-line pt-4">
              <h3 id="where-h" className="text-[15px] font-semibold">
                {entry?.progress?.providerId === "streamingcommunity" ? "Continua a guardare" : "Dove guardarlo"}
              </h3>
              {providers.length === 0 && !isOld(title) && (
                <p className="mt-1 text-sm text-fg-2">Non risulta incluso in nessun abbonamento in Italia.</p>
              )}
              <ul className="mt-3 flex flex-wrap gap-2">
                {sectionOf(title) !== "anime" && (
                  // Every film and non-anime series gets a generic Worker entry point,
                  // even when JustWatch already lists official subscription services.
                  <li>
                    <a
                      href={siteWatchUrl(
                        title.id,
                        title.title,
                        "streamingcommunity",
                        entry?.progress?.providerId === "streamingcommunity" ? entry.progress.url : null,
                        entry?.progress?.fraction ?? 0,
                        title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes,
                        title.type === "movie" ? null : (entry?.progress?.season ?? null),
                        title.type === "movie" ? null : (entry?.progress?.episode ?? null),
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Guarda ${title.title} in streaming`}
                      className="relative z-10 inline-flex h-9 cursor-pointer pointer-events-auto items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-fg transition-colors hover:bg-white/[0.05]"
                    >
                      <span aria-hidden className="size-2 rounded-full bg-fg-3" />
                      Guarda in streaming
                      <ExternalLink aria-hidden className="size-3.5 text-fg-3" />
                    </a>
                  </li>
                )}
                {providers.map((p) => {
                  const progress = entry?.progress;
                  const ownLink = p.id !== "streamingcommunity" && p.id !== "animeunity";
                  // AnimeUnity is a real external destination, not a CineLoop resume/worker route.
                  const destination = p.id === "animeunity" && p.url
                    ? p.url
                    : ownLink && p.url
                      ? (p.continueUrl ?? p.url)
                      : siteWatchUrl(
                          title.id,
                          title.title,
                          p.id,
                          progress?.providerId === "streamingcommunity" ? progress.url : null,
                          progress?.fraction ?? 0,
                          title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes,
                          title.type === "movie" ? null : (progress?.season ?? null),
                          title.type === "movie" ? null : (progress?.episode ?? null),
                        );
                  return (
                    <li key={p.id}>
                      <a
                        href={destination}
                        target={p.id === "streamingcommunity" || p.id === "animeunity" || (ownLink && p.url) ? "_blank" : undefined}
                        rel={p.id === "streamingcommunity" || p.id === "animeunity" || (ownLink && p.url) ? "noopener noreferrer" : undefined}
                        aria-label={p.id === "streamingcommunity" ? `Guarda ${title.title} in streaming` : undefined}
                        className="relative z-10 inline-flex h-9 cursor-pointer pointer-events-auto items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-fg transition-colors hover:bg-white/[0.05]"
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.tint }} />
                        {p.name}
                      </a>
                    </li>
                  );
                })}
                {view.offersUrl && (
                  <li>
                    <a
                      href={view.offersUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg-2 transition-colors hover:bg-white/[0.05] hover:text-fg"
                    >
                      Tutte le offerte, anche a noleggio
                      <ExternalLink aria-hidden className="size-3.5 text-fg-3" />
                      <span className="sr-only">(si apre in una nuova scheda)</span>
                    </a>
                  </li>
                )}
              </ul>
              {SHOW_SOURCE_CHOOSER && watchChoices.length > 0 && (
                <WatchSourceChooser
                  titleId={title.id}
                  titleName={title.title}
                  choices={watchChoices}
                  currentProvider={entry?.progress?.providerId ?? null}
                />
              )}
              <p className="mt-2 text-xs text-fg-3">CineLoop non riproduce i contenuti: ti porta direttamente sulla piattaforma. Le offerte vengono da JustWatch tramite TMDB.</p>
            </div>
          </section>

          {title.type === "movie" && title.collection && !title.partOf && (
            <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
              <SagaSection title={title} />
            </Suspense>
          )}

          {title.type !== "movie" && title.seasons.length > 0 && (
            <section aria-labelledby="seasons-h">
              <h2 id="seasons-h" className="mb-3 text-[15px] font-semibold">
                Stagioni ed episodi
              </h2>
              <SeasonList
                titleId={title.id}
                titleName={title.title}
                seasons={title.seasons}
                at={entry?.progress ? { season: entry.progress.season, episode: entry.progress.episode } : null}
                seenThrough={entry?.status === "completed" ? (entry.seenThrough ?? null) : null}
                progressEdition={progressEdition}
              />
            </section>
          )}

          {title.type !== "movie" && (title.watchOrder?.length ?? 0) > 1 && (
            <section aria-labelledby="order-h">
              <h2 id="order-h" className="mb-3 text-[15px] font-semibold">
                Ordine di visione
              </h2>
              <WatchOrder titleId={title.id} titleName={title.title} parts={title.watchOrder!} overrides={entry?.partOverrides} canChoose={Boolean(entry)} />
            </section>
          )}

          {view.related.length > 0 && (
            <section aria-labelledby="related-h">
              <h2 id="related-h" className="mb-3 text-[15px] font-semibold">
                {title.type === "movie" ? "La serie e gli altri film" : "Altre parti e film collegati"}
              </h2>
              <Rail label="Anime collegati">
                {view.related.map((t) => (
                  <TitleCard key={t.id} title={t} size="sm" meta={titleMeta(t)} />
                ))}
              </Rail>
            </section>
          )}

          {friends.length > 0 && (
            <section aria-labelledby="friends-h">
              <h2 id="friends-h" className="text-[15px] font-semibold">
                I tuoi amici
              </h2>
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                {friends.map((f) => (
                  <li key={f.user.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar user={f.user} size="sm" decorative />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="text-fg">{firstName(f.user.displayName)}</span>{" "}
                      <span className="text-fg-2">
                        {f.status === "wishlist" ? "lo ha in wishlist" : STATUS_LABEL[f.status].toLowerCase()}
                      </span>
                    </span>
                    {f.rating && <RatingStars value={f.rating} size="xs" />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="h-fit space-y-6">
          <aside className="h-fit rounded-xl border border-line bg-surface p-5">
            <TitleActions
              titleId={title.id}
              titleName={title.title}
              status={entry?.status ?? null}
              rating={entry?.rating ?? null}
              wishlisted={view.wishlisted}
              rezeroVersion={selectedReZeroVersion}
            />
            {title.type !== "movie" && (/re\s*:?\s*zero/i.test(title.title) || title.id === "anime-ann-17360") && (
              <ReZeroVersionChooser
                titleId={title.id}
                status={entry?.status === "watching" || entry?.status === "completed" ? entry.status : null}
                version={selectedReZeroVersion}
              />
            )}
            <div className="mt-3">
              <SuggestDialog titleId={title.id} titleName={title.title} friends={view.allFriends} alreadyHave={friends.map((f) => f.user.id)} />
            </div>
            {(title.type !== "movie" || view.together) && (
              <div className="mt-3">
                <SharedWatchPanel titleId={title.id} titleName={title.title} friends={view.allFriends} together={view.together} />
              </div>
            )}
            {title.type !== "movie" && title.watchOrder && <FillerGuide parts={title.watchOrder} />}
            {title.communityRating && (
              <p className="mt-5 border-t border-line pt-4 text-[13px] text-fg-3">
                Voto della community: <span className="text-fg tabular">{title.communityRating.toLocaleString("it-IT")}</span>/10
              </p>
            )}
          </aside>
          {sectionOf(title) !== "anime" && (
            <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
              <MainCast titleId={title.id} />
            </Suspense>
          )}
        </div>
      </div>
    </article>
  );
}

/** Out for at least a year: likely online somewhere even if no covered service lists it. */
function isOld(title: { year: number }): boolean {
  return title.year < Number(italianDay().slice(0, 4));
}
