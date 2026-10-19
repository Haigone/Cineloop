import type { Metadata } from "next";
import { Suspense } from "react";
import { getWishlistView } from "@/server/services/wishlist";
import { WishlistBoard } from "@/components/wishlist/wishlist-board";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage({ searchParams }: PageProps<"/wishlist">) {
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Caricamento della wishlist" className="space-y-3">
          <Skeleton className="h-9 w-48" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </LoadingRegion>
      }
    >
      <WishlistContent searchParams={searchParams} />
    </Suspense>
  );
}

async function WishlistContent({ searchParams }: Pick<PageProps<"/wishlist">, "searchParams">) {
  const [{ rows, playlists, saved, releases }, { tab }] = await Promise.all([getWishlistView(), searchParams]);
  return <WishlistBoard initialRows={rows} playlists={playlists} saved={saved} releases={releases} initialTab={tab === "playlists" ? "playlists" : tab === "sagas" ? "sagas" : tab === "collections" ? "collections" : "list"} />;
}
