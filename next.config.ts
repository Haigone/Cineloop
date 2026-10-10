import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Posters and backdrops when the TMDB catalog is enabled.
  // Anime from the anime sources bring their own pictures (MyAnimeList, Anime News Network).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
      { protocol: "https", hostname: "cdn.myanimelist.net", pathname: "/images/**" },
      { protocol: "https", hostname: "www.animenewsnetwork.com" },
      { protocol: "https", hostname: "cdn.animenewsnetwork.com" },
      { protocol: "https", hostname: "**.anilist.co" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
