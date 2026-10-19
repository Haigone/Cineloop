import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Globe, Clapperboard, LibraryBig, ListVideo } from "lucide-react";
import { getCommunityView } from "@/server/services/community";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { CommunityPlaylistCard } from "@/components/community/community-playlist-card";

export const metadata: Metadata = { title: "Community" };

const categories = [
  { href: "/community", label: "Playlist", description: "Raccolte create e condivise dagli utenti.", icon: ListVideo, current: true },
  { href: "/sagas", label: "Saghe", description: "Storie collegate, trilogie e film con numerazione narrativa.", icon: Clapperboard, current: false },
  { href: "/collections", label: "Collezioni", description: "Universi condivisi e raccolte tematiche curate da CineLoop.", icon: LibraryBig, current: false },
];

export default function CommunityPage() {
  return (
    <>
      <SectionHeader as="h1" title="Community" description="Esplora le playlist della community, le saghe narrative e le collezioni ufficiali curate da CineLoop." />
      <nav aria-label="Categorie Community" className="mb-6 grid gap-3 sm:grid-cols-3">
        {categories.map(({ href, label, description, icon: Icon, current }) => (
          <Link key={href} href={href} aria-current={current ? "page" : undefined} className={`group rounded-xl border p-4 transition-colors ${current ? "border-accent/50 bg-accent/5" : "border-line bg-surface hover:border-fg-3"}`}>
            <div className="flex items-center gap-2 font-semibold text-fg"><Icon aria-hidden className="size-5 text-accent" />{label}</div>
            <p className="mt-2 text-sm leading-5 text-fg-2">{description}</p>
          </Link>
        ))}
      </nav>
      <Suspense fallback={<LoadingRegion label="Caricamento delle playlist della Community" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</LoadingRegion>}>
        <CommunityContent />
      </Suspense>
    </>
  );
}

async function CommunityContent() {
  const playlists = await getCommunityView();
  if (playlists.length === 0) return <EmptyState icon={<Globe />} title="Ancora nessuna playlist pubblicata." description="Le playlist possono essere create dagli utenti e pubblicate nella Community. Saghe e collezioni ufficiali sono invece curate esclusivamente da CineLoop." action={<ButtonLink href="/wishlist?tab=playlists">Vai alle tue playlist</ButtonLink>} />;
  return <ul className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">{playlists.map((view) => <CommunityPlaylistCard key={view.playlist.id} view={view} where="community" />)}</ul>;
}
