import "server-only";
import { genreProfile, summarize, type SideSummary } from "@/domain/compare";
import { genreShares, ratingDistribution, socialRankings, topRated, type RankedTitle, type SocialRankings } from "@/domain/rankings";
import { dailyMinutes, weekStart } from "@/domain/stats";
import type { Genre, User } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { loadFriendBundles } from "./shared";

export interface PersonalRankings {
  movies: RankedTitle[];
  series: RankedTitle[];
  anime: RankedTitle[];
  genres: { genre: Genre; share: number }[];
  distribution: number[];
}

async function loadOwn() {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [library, wishlist, allTitles] = await Promise.all([repo.listLibrary(viewer.id), repo.listWishlist(viewer.id), repo.listTitles()]);
  return { viewer, repo, library, wishlist, titles: new Map(allTitles.map((t) => [t.id, t])) };
}

export async function getRankingsView(): Promise<{ personal: PersonalRankings; social: SocialRankings; friendCount: number }> {
  const { viewer, repo, library, titles } = await loadOwn();
  const friends = await loadFriendBundles(repo, viewer.id);
  return {
    personal: {
      movies: topRated(library, titles, "movie", 10),
      series: topRated(library, titles, "series", 10),
      anime: topRated(library, titles, "anime", 10),
      genres: genreShares(genreProfile(library, titles), 6),
      distribution: ratingDistribution(library),
    },
    social: socialRankings(friends, titles, 8),
    friendCount: friends.length,
  };
}

export interface ProfileView {
  user: User;
  summary: SideSummary;
  totalMinutes: number;
  genres: { genre: Genre; share: number }[];
  week: { day: string; minutes: number }[];
  top: RankedTitle[];
  friendCount: number;
}

export async function getProfileView(): Promise<ProfileView> {
  const { viewer, repo, library, wishlist, titles } = await loadOwn();
  const now = new Date();
  const [events, allEvents, friends] = await Promise.all([
    repo.listWatchEvents(viewer.id, weekStart(now)),
    repo.listWatchEvents(viewer.id, new Date(0)),
    repo.listFriends(viewer.id),
  ]);
  const minutes = dailyMinutes(events, now);
  const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
  return {
    user: viewer,
    summary: summarize({ library, wishlist }, titles),
    totalMinutes: allEvents.reduce((s, e) => s + e.minutes, 0),
    genres: genreShares(genreProfile(library, titles), 5),
    week: minutes.map((m, i) => ({ day: dayFmt.format(new Date(now.getTime() - (6 - i) * 86_400_000)), minutes: m })),
    top: [...topRated(library, titles, "movie", 3), ...topRated(library, titles, "series", 3), ...topRated(library, titles, "anime", 3)]
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    friendCount: friends.length,
  };
}
