import type { Metadata } from "next";
import type { MediaType } from "@/domain/types";
import Link from "next/link";
import { Suspense } from "react";
import { Clapperboard, Users } from "lucide-react";
import { getHomeView, type HomeLater } from "@/server/services/dashboard";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { Rail } from "@/components/media/rail";
import { FriendActivityList } from "@/components/social/friend-activity-list";
import { LiveFriends } from "@/components/social/live-friends";
import { Hero } from "@/components/home/hero";
import { InProgressCard } from "@/components/home/in-progress-card";
import { CollectionQueueCard } from "@/components/home/collection-queue-card";
import { TogetherPlaceholder } from "@/components/home/together-placeholder";
import { UpcomingNightCard } from "@/components/home/upcoming-night";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { PartyTeaser } from "@/components/home/party-teaser";
import { reasonLabel } from "@/components/home/tonight";
import { WeekStats } from "@/components/home/week-stats";
import { RecentlyWatched } from "@/components/home/recently-watched";
import { TonightQueue } from "@/components/home/tonight-queue";
import { RatePrompt } from "@/components/home/rate-prompt";
import { NewEpisodeNotice } from "@/components/home/new-episode-notice";
import { FillerNotice } from "@/components/home/filler-notice";
import { AwaitingList } from "@/components/library/awaiting-list";
import { newSeasonsLabel } from "@/server/services/new-seasons";
import { NewSeasonsRail } from "@/components/library/new-seasons-rail";
import { OpenSagas } from "@/components/home/open-sagas";
import { HOME_SECTIONS, HomeSectionTabs, SectionBackdrop, sectionFromSlug } from "@/components/home/home-sections";

export const metadata: Metadata = { title: "Home" };

export default function HomePage({ searchParams }: PageProps<"/home">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

const EMPTY: Record<MediaType, { hero: string; wishlist: string }> = {
  movie: { hero: "Nessun film in corso.", wishlist: "Aggiungi film alla wishlist e qui troverai cosa guardare stasera." },
  series: { hero: "Nessuna serie in corso.", wishlist: "Aggiungi serie alla wishlist e qui troverai cosa guardare stasera." },
  anime: { hero: "Nessun anime in corso.", wishlist: "Aggiungi anime alla wishlist e qui troverai cosa guardare stasera." },
};

/** The next episode of something being watched: asks outside services, so it arrives after the page. */
async function NextEpisode({ later, titleId }: { later: Promise<HomeLater>; titleId: string }) {
  const release = (await later).upcomingEpisodes[titleId];
  return release ? <NewEpisodeNotice release={release} /> : null;
}

async function CollectionQueue({ later }: { later: Promise<HomeLater> }) {
  const { collections } = await later;
  if (!collections.length) return null;
  return <RevealItem as="section" className="order-4 min-w-0"><SectionHeader title="La tua coda collezioni" description="Il prossimo film cambia automaticamente quando completi quello in corso." href="/collections" hrefLabel="Apri collezioni" /><ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-3">{collections.map((item) => <CollectionQueueCard key={item.collection.id} item={item} />)}</ul></RevealItem>;
}

async function CollectionAwareHero({ item, together, later }: { item: import("@/server/services/shared").ContinueItem; together: import("@/server/services/shared-watch").SharedWatchView | null; later: Promise<HomeLater> }) {
  const { collections } = await later;
  const collection = collections.find((entry) => entry.currentTitleId === item.title.id);
  return <Hero item={item} together={together} collection={collection ? { name: collection.collection.name, nextTitle: collection.next?.title ?? null } : undefined} />;
}

async function CollectionAwareCard({ item, later }: { item: import("@/server/services/shared").ContinueItem; later: Promise<HomeLater> }) {
  const { collections } = await later;
  const collection = collections.find((entry) => entry.currentTitleId === item.title.id);
  return <InProgressCard item={item} collection={collection ? { name: collection.collection.name, nextTitle: collection.next?.title ?? null } : undefined} />;
}

async function News({ later, wishlistIds }: { later: Promise<HomeLater>; wishlistIds: ReadonlySet<string> }) {
  const { newSeasons, awaiting } = await later;
  if (newSeasons.length === 0 && awaiting.length === 0) return null;
  return (
    <RevealItem as="section" className="order-4 min-w-0">
      <SectionHeader title="Novità" description="Serie che avevi finito e che hanno una stagione nuova o un nuovo episodio in arrivo." href="/library" hrefLabel="Apri libreria" />
      {newSeasons.length > 0 && <NewSeasonsRail items={newSeasons.map((i) => ({ title: i.title, label: newSeasonsLabel(i) }))} wishlistIds={wishlistIds} />}
      {awaiting.length > 0 && (
        <div className={newSeasons.length > 0 ? "mt-4" : ""}>
          <AwaitingList items={awaiting} dismissible />
        </div>
      )}
    </RevealItem>
  );
}

/** Wishlist titles not out yet, with the time left: asks the catalogue, so it arrives after the page. */
async function ComingFromWishlist({ later }: { later: Promise<HomeLater> }) {
  const { premieres } = await later;
  if (premieres.length === 0) return null;
  return (
    <RevealItem as="section" className="order-4 min-w-0">
      <SectionHeader title="In uscita dalla tua wishlist" id="home-premieres" description="Titoli che hai messo in wishlist e che non sono ancora usciti: ti avvisiamo il giorno dell’uscita." href="/explore" hrefLabel="Apri Esplora" />
      <AwaitingList items={premieres} label="In uscita dalla tua wishlist" />
    </RevealItem>
  );
}

/** Sagas the viewer started and has not finished: asks the catalogue, so it arrives after the page. Films only. */
async function Sagas({ later }: { later: Promise<HomeLater> }) {
  const { sagas } = await later;
  if (sagas.length === 0) return null;
  return (
    <RevealItem as="section" className="order-4 min-w-0">
      <SectionHeader
        title="Saghe da completare"
        id="home-sagas"
        description="Trilogie e saghe che hai iniziato: il prossimo film da vedere e quelli in arrivo, con la data. Ti avvisiamo anche tra le notifiche."
      />
      <OpenSagas sagas={sagas} />
    </RevealItem>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
  const params = await searchParams;
  const view = await getHomeView(sectionFromSlug(params.c));
  const wishlistIds = new Set(view.wishlistIds);
  const section = HOME_SECTIONS.find((s) => s.type === view.category)!;

  return (
    <>
    {view.background && <SectionBackdrop title={view.background} />}
    <h1 className="sr-only">Home: {section.label}</h1>
    <HomeSectionTabs current={view.category} background={view.background} />
    {view.toRate.length > 0 && (
      <div className="mt-6">
        <RatePrompt titles={view.toRate} />
      </div>
    )}
    <Reveal key={view.category} className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main column. `contents` below xl lets the side panels interleave by priority on small screens. */}
      <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-10">
        <RevealItem className="order-1">
          {view.nowWatching ? (
            <>
              <CollectionAwareHero item={view.nowWatching} together={view.nowWatchingGroup} later={view.later} />
              {view.fillerRuns[view.nowWatching.title.id] && (
                <FillerNotice titleId={view.nowWatching.title.id} titleName={view.nowWatching.title.title} run={view.fillerRuns[view.nowWatching.title.id]!} />
              )}
              <Suspense fallback={null}>
                <NextEpisode later={view.later} titleId={view.nowWatching.title.id} />
              </Suspense>
            </>
          ) : (
            <section aria-label={EMPTY[view.category].hero} className="rounded-xl border border-line bg-surface/80 backdrop-blur-md">
              <EmptyState
                className="border-0"
                icon={<Clapperboard />}
                title={EMPTY[view.category].hero}
                description="Cerca un titolo e segnalo come “In corso”, oppure usa “A che punto sei?”: lo ritroverai qui, pronto da riprendere."
                action={<ButtonLink href="/library">Apri la libreria</ButtonLink>}
              />
            </section>
          )}
        </RevealItem>

        {(view.together.length > 0 || view.upcomingNights.length > 0) && (
          <RevealItem as="section" className="order-2 min-w-0">
            <SectionHeader
              title="Serate insieme"
              description="Le guardi con gli amici: quando uno di voi va avanti, il punto si aggiorna per tutti."
            />
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {view.together.map(({ group, item }) => (
                <li key={group.id} className="min-w-0">
                  {item ? (
                    <>
                      <InProgressCard item={item} together={group} />
                      {view.fillerRuns[item.title.id] && <FillerNotice titleId={item.title.id} titleName={item.title.title} run={view.fillerRuns[item.title.id]!} />}
                      <Suspense fallback={null}>
                        <NextEpisode later={view.later} titleId={item.title.id} />
                      </Suspense>
                    </>
                  ) : (
                    <TogetherPlaceholder group={group} />
                  )}
                </li>
              ))}
              {view.upcomingNights.map((night) => (
                <li key={night.party.id} className="min-w-0">
                  <UpcomingNightCard night={night} />
                </li>
              ))}
            </ul>
          </RevealItem>
        )}

        {view.continueWatching.length > 0 && (
          <RevealItem as="section" className="order-2 min-w-0">
            <SectionHeader title="Stai guardando anche" href="/library?filter=watching" />
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {view.continueWatching.map((item) => (
                <li key={item.title.id} className="min-w-0">
                  <CollectionAwareCard item={item} later={view.later} />
                  {view.fillerRuns[item.title.id] && <FillerNotice titleId={item.title.id} titleName={item.title.title} run={view.fillerRuns[item.title.id]!} />}
                  <Suspense fallback={null}>
                    <NextEpisode later={view.later} titleId={item.title.id} />
                  </Suspense>
                </li>
              ))}
            </ul>
          </RevealItem>
        )}

        <RevealItem as="section" className="order-4 min-w-0">
          <SectionHeader
            title="Da vedere stasera"
            description={`La tua wishlist di ${section.label === "Serie TV" ? "serie TV" : section.label.toLowerCase()} in ordine di priorità: trascina le copertine per cambiarlo. Dopo, le idee dei tuoi amici.`}
            href="/wishlist"
            hrefLabel="Apri wishlist"
          />
          {view.wishlist.length + view.tonight.length > 0 ? (
            <TonightQueue
              wishlist={view.wishlist.map((title) => {
                const pick = view.tonight.find((p) => p.title.id === title.id);
                // Only reasons worth reading: a friend suggested it or wants it too.
                return { title, meta: pick && (pick.reason.kind !== "wishlist" || pick.sharedWith.length) ? reasonLabel(pick) : null };
              })}
              ideas={view.tonight.filter((p) => !wishlistIds.has(p.title.id)).map((p) => ({ title: p.title, meta: reasonLabel(p) }))}
            />
          ) : (
            <EmptyState
              compact
              icon={<Clapperboard />}
              title="La tua prossima ossessione potrebbe iniziare qui."
              description={EMPTY[view.category].wishlist}
            />
          )}
        </RevealItem>

        {view.category === "movie" && <><Suspense fallback={null}><Sagas later={view.later} /></Suspense><Suspense fallback={null}><CollectionQueue later={view.later} /></Suspense></>}

        <Suspense fallback={null}>
          <ComingFromWishlist later={view.later} />
        </Suspense>

        <Suspense fallback={null}>
          <News later={view.later} wishlistIds={wishlistIds} />
        </Suspense>
      </div>

      {/* Side column */}
      <div className="contents xl:flex xl:flex-col xl:gap-4">
        <RevealItem as="aside" className="order-3">
          <Panel title="I tuoi amici stanno guardando" titleId="friends-activity" action={<Link href="/friends" className="rounded-sm text-xs text-fg-2 hover:text-fg">Vedi tutti</Link>}>
            {view.liveFriends.length + view.friendsActivity.length > 0 ? (
              <>
                {view.liveFriends.length > 0 && <LiveFriends items={view.liveFriends} />}
                {view.friendsActivity.length > 0 && (
                  <FriendActivityList items={view.friendsActivity.slice(0, Math.max(2, 5 - view.liveFriends.length))} />
                )}
              </>
            ) : (
              <EmptyState
                compact
                className="border-0"
                icon={<Users />}
                title="Aggiungi amici per scoprire cosa stanno guardando."
                action={<ButtonLink href="/friends" variant="secondary" size="sm">Trova amici</ButtonLink>}
              />
            )}
          </Panel>
        </RevealItem>
        <RevealItem className="order-5">
          <Panel title="Questa settimana" titleId="week-stats">
            <WeekStats stats={view.week} />
          </Panel>
        </RevealItem>
        <RevealItem className="order-6">
          <Panel title="Visti di recente" titleId="recently-watched" action={<Link href="/library" className="rounded-sm text-xs text-fg-2 hover:text-fg">Libreria</Link>}>
            <RecentlyWatched items={view.recentlyWatched} />
          </Panel>
        </RevealItem>
        {view.party.friends.length > 0 && (
          <RevealItem className="order-7">
            <Panel title="Serata insieme" titleId="party-teaser">
              <PartyTeaser friends={view.party.friends} compatibleCount={view.party.compatibleCount} />
            </Panel>
          </RevealItem>
        )}
      </div>
    </Reveal>
    </>
  );
}
