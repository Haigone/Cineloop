import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/server/auth/current-user";
import { getLibraryView } from "@/server/services/library";
import { getWishlistView } from "@/server/services/wishlist";
import { getExploreView } from "@/server/services/explore";
import { TvShell } from "./tv-shell";
import "./tv.css";

// This authenticated, cookie-backed page must render at request time rather than prerender.
export const instant = false;

export const metadata: Metadata = {
  title: "CineLoop TV",
  description: "La tua libreria, la wishlist e il catalogo CineLoop sul televisore.",
};

type TvSearchParams = Promise<{ tab?: string; q?: string }>;

export default async function TvPage({ searchParams }: { searchParams: TvSearchParams }) {
  const params = await searchParams;
  const tab = ["home", "library", "explore", "wishlist"].includes(params.tab ?? "")
    ? (params.tab as "home" | "library" | "explore" | "wishlist")
    : "home";
  const query = (params.q ?? "").trim().slice(0, 80);
  const user = await getOptionalUser();
  if (!user) redirect("/login?next=%2Ftv");

  const [library, wishlist, explore] = await Promise.all([
    getLibraryView(),
    getWishlistView(),
    getExploreView({
      q: query,
      type: "all",
      genre: null,
      provider: null,
      sort: "popular",
      page: 1,
      hideKnown: query.length < 2,
    }),
  ]);

  return (
    <TvShell
      user={{ displayName: user.displayName, username: user.username }}
      tab={tab}
      query={query}
      library={library.items.map(({ title, entry }) => ({
        id: title.id,
        title: title.title,
        year: title.year,
        type: title.type,
        posterUrl: title.artwork.posterUrl,
        status: entry.status,
        rating: entry.rating,
        season: entry.progress?.season ?? null,
        episode: entry.progress?.episode ?? null,
      }))}
      wishlist={wishlist.rows.map(({ title }) => ({
        id: title.id,
        title: title.title,
        year: title.year,
        type: title.type,
        posterUrl: title.artwork.posterUrl,
      }))}
      explore={explore.titles.map((title) => ({
        id: title.id,
        title: title.title,
        year: title.year,
        type: title.type,
        posterUrl: title.artwork.posterUrl,
      }))}
      wishlistIds={explore.wishlistIds}
    />
  );
}
