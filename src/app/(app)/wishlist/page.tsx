import type { Metadata } from "next";
import { Suspense } from "react";
import { getWishlistView } from "@/server/services/wishlist";
import { WishlistBoard } from "@/components/wishlist/wishlist-board";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
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
      <WishlistContent />
    </Suspense>
  );
}

async function WishlistContent() {
  const { rows } = await getWishlistView();
  return <WishlistBoard initialRows={rows} />;
}
