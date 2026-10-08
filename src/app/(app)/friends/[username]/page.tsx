import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Lock, Popcorn } from "lucide-react";
import { getFriendProfile } from "@/server/services/friends";
import { episodeLabel, firstName, percent } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { RatingStars } from "@/components/ui/rating-stars";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { CompareTable } from "@/components/friends/compare-table";
import { CompatibilityMeter } from "@/components/friends/compatibility-meter";
import { RemoveFriendButton } from "@/components/friends/remove-friend-button";
import { FriendActivityList } from "@/components/social/friend-activity-list";

export const metadata: Metadata = { title: "Amico" };

export default function FriendPage({ params }: PageProps<"/friends/[username]">) {
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Caricamento del profilo" className="space-y-6">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </LoadingRegion>
      }
    >
      <FriendContent params={params} />
    </Suspense>
  );
}

async function FriendContent({ params }: { params: PageProps<"/friends/[username]">["params"] }) {
  const { username } = await params;
  const view = await getFriendProfile(decodeURIComponent(username));
  if (!view) notFound();
  const { friend, comparison: c } = view;
  const name = firstName(friend.displayName);
  const wishlist = new Set(view.viewerWishlistIds);
  const hidden = c.b.movies + c.b.series + c.b.anime + c.b.wishlist === 0 && !view.isFriend;

  return (
    <div className="space-y-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar user={friend} size="lg" live={view.watching.length > 0 && view.recent[0]?.live} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{friend.displayName}</h1>
            <p className="text-sm text-fg-3">@{friend.username}</p>
            {friend.bio && <p className="mt-1.5 max-w-[60ch] text-sm text-fg-2">{friend.bio}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view.isFriend && <RemoveFriendButton friendId={friend.id} name={name} />}
          <ButtonLink href={`/watch-party?with=${friend.username}`} icon={<Popcorn aria-hidden className="size-4" />}>
            Organizza una serata
          </ButtonLink>
        </div>
      </header>

      {hidden ? (
        <EmptyState icon={<Lock />} title={`Il profilo di ${name} è visibile solo agli amici.`} description="Aggiungilo agli amici per confrontare i vostri gusti." />
      ) : (
        <>
          {view.watching.length > 0 && (
            <section aria-labelledby="watching-h">
              <SectionHeader id="watching-h" title={`${name} sta guardando`} />
              <Rail label={`${name} sta guardando`}>
                {view.watching.map(({ entry, title }) => (
                  <TitleCard
                    key={title.id}
                    title={title}
                    wishlisted={wishlist.has(title.id)}
                    meta={entry.progress ? [episodeLabel(entry.progress, "short"), percent(entry.progress.fraction)].filter(Boolean).join(" · ") : undefined}
                  />
                ))}
              </Rail>
            </section>
          )}

          <section id="confronto" aria-labelledby="compare-h" className="scroll-mt-24">
            <SectionHeader id="compare-h" title={`Tu e ${name}`} description="Confronto basato su ciò che avete visto e votato." />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="rounded-xl border border-line bg-surface p-5">
                <p className="text-[13px] text-fg-2">Affinità di gusti</p>
                <CompatibilityMeter value={c.compatibility} size="lg" className="mt-2" />
                <div className="mt-6">
                  <CompareTable a={c.a} b={c.b} nameA="Tu" nameB={name} />
                </div>
                {c.commonGenres.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="text-[13px] text-fg-2">Generi in comune</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {c.commonGenres.map((g) => (
                        <li key={g} className="rounded-md border border-line-strong px-2.5 py-1 text-xs text-fg">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-line bg-surface p-5">
                <h3 className="text-[15px] font-semibold">Visti da entrambi</h3>
                {c.common.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-2">Ancora nessun titolo in comune. La prossima serata insieme può cambiare le cose.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {c.common.slice(0, 7).map(({ title, ratingA, ratingB }) => (
                      <li key={title.id} className="flex items-center gap-3 py-2.5">
                        <Link href={`/title/${title.id}`} className="min-w-0 flex-1 truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4">
                          {title.title}
                        </Link>
                        <span className="flex w-24 flex-col items-end gap-0.5">
                          <RatingStars value={ratingA} size="xs" />
                          <span className="sr-only">tuo voto</span>
                        </span>
                        <span className="flex w-24 flex-col items-end gap-0.5">
                          <RatingStars value={ratingB} size="xs" />
                          <span className="sr-only">voto di {name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {c.common.length > 0 && (
                  <p className="mt-2 flex justify-end gap-3 text-[11px] text-fg-3" aria-hidden>
                    <span className="w-24 text-right">Tu</span>
                    <span className="w-24 text-right">{name}</span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {c.bothWant.length > 0 && (
            <section aria-labelledby="both-h">
              <SectionHeader
                id="both-h"
                title="Volete vederli entrambi"
                description="Titoli condivisi: i candidati perfetti per una serata insieme."
                action={
                  <ButtonLink href={`/watch-party?with=${friend.username}`} variant="secondary" size="sm">
                    Gira la ruota
                  </ButtonLink>
                }
              />
              <Rail label="Titoli che volete vedere entrambi">
                {c.bothWant.map((t) => (
                  <TitleCard key={t.id} title={t} wishlisted />
                ))}
              </Rail>
            </section>
          )}

          <div className="grid gap-10 xl:grid-cols-2">
            {c.onlyB.length > 0 && (
              <section aria-labelledby="onlyb-h" className="min-w-0">
                <SectionHeader id="onlyb-h" title={`Visti da ${name}, non da te`} />
                <Rail label={`Visti da ${name}, non da te`}>
                  {c.onlyB.map((t) => (
                    <TitleCard key={t.id} title={t} size="sm" wishlisted={wishlist.has(t.id)} />
                  ))}
                </Rail>
              </section>
            )}
            {c.onlyA.length > 0 && (
              <section aria-labelledby="onlya-h" className="min-w-0">
                <SectionHeader id="onlya-h" title={`Visti da te, non da ${name}`} />
                <Rail label={`Visti da te, non da ${name}`}>
                  {c.onlyA.map((t) => (
                    <TitleCard key={t.id} title={t} size="sm" showWishlist={false} />
                  ))}
                </Rail>
              </section>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Wishlist di ${name}`} titleId="their-wishlist">
              {view.wishlist.length === 0 ? (
                <p className="text-sm text-fg-2">{name} non ha ancora titoli in wishlist.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {view.wishlist.slice(0, 6).map(({ title }) => (
                    <li key={title.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link href={`/title/${title.id}`} className="truncate rounded-sm text-fg hover:underline hover:underline-offset-4">
                        {title.title}
                      </Link>
                      {wishlist.has(title.id) && <span className="shrink-0 text-xs text-violet">Anche nella tua</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Attività recente" titleId="their-activity">
              {view.recent.length ? <FriendActivityList items={view.recent.slice(0, 5)} dense /> : <p className="text-sm text-fg-2">Nessuna attività recente.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
