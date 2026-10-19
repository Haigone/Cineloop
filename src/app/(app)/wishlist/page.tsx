import type { Metadata } from "next";
import { Suspense } from "react";
import { getWishlistView } from "@/server/services/wishlist";
import { CURATED_COLLECTIONS, getCollectionDetailView, getSagaCatalogView } from "@/server/services/collections";
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
  const [sagaViews, collectionViews] = await Promise.all([
    getSagaCatalogView(),
    Promise.all(CURATED_COLLECTIONS.map(async (definition) => ({ definition, view: await getCollectionDetailView("demo-collection-" + definition.slug) }))),
  ]);
  const sagas = sagaViews.filter((item) => item.followed || item.saga.started).map(({ saga }) => ({ id: saga.collection.id, name: saga.collection.name, saga }));
  const collections = collectionViews.filter(({ view }) => view && (view.followed || view.saga.started)).flatMap(({ definition, view }) => view ? [{ id: "demo-collection-" + definition.slug, name: definition.name, saga: view.saga }] : []);
  return <WishlistBoard initialRows={rows} playlists={playlists} saved={saved} releases={releases} sagas={sagas} collections={collections} initialTab={tab === "playlists" ? "playlists" : tab === "sagas" ? "sagas" : tab === "collections" ? "collections" : "list"} />;
}
