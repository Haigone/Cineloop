import type { Metadata } from "next";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { getFriendsView } from "@/server/services/friends";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { AddFriendForm } from "@/components/friends/add-friend-form";
import { FriendCard } from "@/components/friends/friend-card";
import { FriendActivityList } from "@/components/social/friend-activity-list";

export const metadata: Metadata = { title: "Amici" };

export default function FriendsPage() {
  return (
    <>
      <SectionHeader as="h1" title="Amici" description="Cosa guardano, cosa vogliono vedere e quanto i vostri gusti si somigliano." />
      <Suspense
        fallback={
          <LoadingRegion label="Caricamento degli amici" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </LoadingRegion>
        }
      >
        <FriendsContent />
      </Suspense>
    </>
  );
}

async function FriendsContent() {
  const view = await getFriendsView();
  return (
    <Reveal className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <RevealItem as="section" className="min-w-0">
        <h2 className="sr-only">I tuoi amici</h2>
        {view.friends.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Aggiungi amici per scoprire cosa stanno guardando."
            description="Chiedi il loro username su CineLoop e aggiungili qui accanto."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {view.friends.map((f) => (
              <li key={f.user.id}>
                <FriendCard friend={f} />
              </li>
            ))}
          </ul>
        )}
      </RevealItem>
      <RevealItem className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <Suspense>
            <AddFriendForm />
          </Suspense>
        </div>
        {view.feed.length > 0 && (
          <Panel title="Attività recente" titleId="friends-feed">
            <FriendActivityList items={view.feed} dense />
          </Panel>
        )}
      </RevealItem>
    </Reveal>
  );
}
