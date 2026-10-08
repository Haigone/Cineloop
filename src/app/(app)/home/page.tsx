import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clapperboard, Users } from "lucide-react";
import { getHomeView } from "@/server/services/dashboard";
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
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { PartyTeaser } from "@/components/home/party-teaser";
import { TonightRail } from "@/components/home/tonight";
import { WeekStats } from "@/components/home/week-stats";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const view = await getHomeView();
  const wishlistIds = new Set(view.wishlistIds);

  return (
    <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main column. `contents` below xl lets the side panels interleave by priority on small screens. */}
      <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-10">
        <RevealItem className="order-1">
          {view.nowWatching ? (
            <Hero item={view.nowWatching} wishlisted={wishlistIds.has(view.nowWatching.title.id)} />
          ) : (
            <section aria-labelledby="hero-empty" className="rounded-xl border border-line bg-surface">
              <h1 id="hero-empty" className="sr-only">
                Home
              </h1>
              <EmptyState
                className="border-0"
                icon={<Clapperboard />}
                title="Il tuo viaggio cinematografico inizia qui."
                description="Cerca un titolo e segnalo come “In corso”: lo ritroverai qui, pronto da riprendere."
                action={<ButtonLink href="/library">Apri la libreria</ButtonLink>}
              />
            </section>
          )}
        </RevealItem>

        {view.continueWatching.length > 0 && (
          <RevealItem as="section" className="order-2 min-w-0">
            <SectionHeader title="Stai guardando anche" href="/library?filter=watching" />
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {view.continueWatching.map((item) => (
                <li key={item.title.id} className="min-w-0">
                  <InProgressCard item={item} />
                </li>
              ))}
            </ul>
          </RevealItem>
        )}

        <RevealItem as="section" className="order-4 min-w-0">
          <SectionHeader
            title="Da vedere stasera"
            description="Dalla tua wishlist e da quello che piace ai tuoi amici."
            href="/wishlist"
            hrefLabel="Apri wishlist"
          />
          {view.tonight.length > 0 ? (
            <TonightRail picks={view.tonight} wishlistIds={wishlistIds} />
          ) : (
            <EmptyState
              compact
              icon={<Clapperboard />}
              title="La tua prossima ossessione potrebbe iniziare qui."
              description="Aggiungi titoli alla wishlist e qui troverai cosa guardare stasera."
            />
          )}
        </RevealItem>
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
        {view.party.friends.length > 0 && (
          <RevealItem className="order-6">
            <Panel title="Serata insieme" titleId="party-teaser">
              <PartyTeaser friends={view.party.friends} compatibleCount={view.party.compatibleCount} />
            </Panel>
          </RevealItem>
        )}
      </div>
    </Reveal>
  );
}
