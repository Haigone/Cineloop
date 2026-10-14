import type { Metadata } from "next";
import { Suspense } from "react";
import { Globe } from "lucide-react";
import { getCommunityView } from "@/server/services/community";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { CommunityPlaylistCard } from "@/components/community/community-playlist-card";

export const metadata: Metadata = { title: "Community" };

export default function CommunityPage() {
  return (
    <>
      <SectionHeader
        as="h1"
        title="Community"
        description="Le playlist che gli utenti di CineLoop hanno pubblicato. Salvale tra le tue playlist o aggiungi alla wishlist i titoli che ti mancano."
      />
      <Suspense
        fallback={
          <LoadingRegion label="Caricamento della Community" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </LoadingRegion>
        }
      >
        <CommunityContent />
      </Suspense>
    </>
  );
}

async function CommunityContent() {
  const playlists = await getCommunityView();
  if (playlists.length === 0)
    return (
      <EmptyState
        icon={<Globe />}
        title="Ancora nessuna playlist pubblicata."
        description="Pubblica una delle tue dalla Wishlist, scheda Playlist: sarà la prima che gli altri trovano qui."
        action={<ButtonLink href="/wishlist?tab=playlists">Vai alle tue playlist</ButtonLink>}
      />
    );
  return (
    <ul className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {playlists.map((view) => (
        <CommunityPlaylistCard key={view.playlist.id} view={view} where="community" />
      ))}
    </ul>
  );
}
