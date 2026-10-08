import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { STATUS_LABEL } from "@/domain/library";
import { getTitleView } from "@/server/services/library";
import { episodeLabel, firstName, percent, titleMeta } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingStars } from "@/components/ui/rating-stars";
import { KeyArt } from "@/components/media/key-art";
import { TitleActions } from "@/components/title/title-actions";
import { SuggestDialog } from "@/components/title/suggest-dialog";
import { ProgressEditor } from "@/components/title/progress-editor";

export const metadata: Metadata = { title: "Titolo" };

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
  const view = await getTitleView(id);
  if (!view) notFound();
  const { title, entry, providers, friends } = view;

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
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <p className="max-w-[68ch] text-[15px] leading-relaxed text-fg-2">{title.overview}</p>

          <section aria-labelledby="progress-h" className="max-w-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="progress-h" className="text-[15px] font-semibold">
                Dove sei arrivato
              </h2>
              <ProgressEditor title={title} progress={entry?.progress ?? null} />
            </div>
            {entry?.progress ? (
              <>
                <p className="mt-1 text-sm text-fg-2">{episodeLabel(entry.progress) ?? "In corso"}</p>
                <ProgressBar className="mt-3" value={entry.progress.fraction} label={`Avanzamento di ${title.title}`} />
                <p className="mt-1.5 text-xs text-fg-3 tabular">{percent(entry.progress.fraction)} visto</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-fg-2">Lo guardi fuori da Netflix? Segna qui il punto, lo ritrovi in Home su ogni dispositivo.</p>
            )}
          </section>

          <section aria-labelledby="where-h">
            <h2 id="where-h" className="text-[15px] font-semibold">
              Dove guardarlo
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {providers.map((p) => (
                <li key={p.id}>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-fg transition-colors hover:bg-white/[0.05]"
                    >
                      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.tint }} />
                      {p.name}
                      <ExternalLink aria-hidden className="size-3.5 text-fg-3" />
                      <span className="sr-only">(si apre in una nuova scheda)</span>
                    </a>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg-2">
                      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.tint }} />
                      {p.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-fg-3">CineLoop non riproduce i contenuti: ti porta direttamente sulla piattaforma.</p>
          </section>

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

        <aside className="h-fit rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-[calc(var(--topbar-height)+24px)]">
          <TitleActions
            titleId={title.id}
            titleName={title.title}
            status={entry?.status ?? null}
            rating={entry?.rating ?? null}
            wishlisted={view.wishlisted}
          />
          <div className="mt-3">
            <SuggestDialog titleId={title.id} titleName={title.title} friends={view.allFriends} alreadyHave={friends.map((f) => f.user.id)} />
          </div>
          {title.communityRating && (
            <p className="mt-5 border-t border-line pt-4 text-[13px] text-fg-3">
              Voto della community: <span className="text-fg tabular">{title.communityRating.toLocaleString("it-IT")}</span>/10
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}
