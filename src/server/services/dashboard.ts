import "server-only";
import { after } from "next/server";
import { isLive } from "@/domain/presence";
import { sectionOf, type ActivityEvent, type LibraryEntry, type MediaType, type PublicUser, type Title, type UserPreferences } from "@/domain/types";
import { italianDay } from "@/lib/dates";
import { listNewSeasons, type NewSeasonItem } from "./new-seasons";
import { pickForTonight, type TonightPick } from "@/domain/recommend";
import { computeWeeklyStats, weekStart, type WeeklyStats } from "@/domain/stats";
import { compatibleTitles, toPartyMember } from "@/domain/watch-party";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { listSharedActivity, loadFriendBundles, toContinueItem, toPublicUser, type ContinueItem } from "./shared";
import { listLiveFriends, type LiveFriend } from "./sync";

export interface FriendActivityItem {
  event: ActivityEvent;
  user: PublicUser;
  title: Title;
  /** Watching right now (activity in the last 3 hours). */
  live: boolean;
}

export interface HomeView {
  viewer: PublicUser;
  /** The section shown: Home holds only films, only series or only anime. */
  category: MediaType;
  /** The section's background: the title chosen in Impostazioni, else the last one watched there. */
  background: Title | null;
  nowWatching: ContinueItem | null;
  continueWatching: ContinueItem[];
  /** Friends watching right now through the extension; they can be joined. */
  liveFriends: LiveFriend[];
  friendsActivity: FriendActivityItem[];
  week: WeeklyStats;
  tonight: TonightPick[];
  party: { friends: PublicUser[]; compatibleCount: number };
  wishlistIds: string[];
  /** The wishlist's titles in the user's order of priority. */
  wishlist: Title[];
  /** "Novità": finished series with a new season out. */
  newSeasons: NewSeasonItem[];
}

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Home for one section. With no section asked for, the one opened last; an
 * explicit one is remembered for next time.
 */
export async function getHomeView(asked: MediaType | null = null): Promise<HomeView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const now = new Date();

  const [library, wishlist, events, friends, presence] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    repo.listWatchEvents(viewer.id, weekStart(now)),
    loadFriendBundles(repo, viewer.id),
    repo.getPresence(viewer.id),
  ]);
  const friendIds = friends.map((f) => f.user.id);
  const [activity, prefs, liveFriends] = await Promise.all([
    listSharedActivity(repo, friendIds, 30),
    repo.getPreferences(viewer.id),
    listLiveFriends(repo, viewer.id, friendIds),
  ]);
  const liveIds = new Set(liveFriends.map((l) => l.user.id));

  const category = asked ?? prefs.homeCategory;
  if (asked && asked !== prefs.homeCategory) after(() => repo.updatePreferences(viewer.id, { homeCategory: asked }));

  const allTitles = await repo.listTitles();
  const titles = new Map(allTitles.map((t) => [t.id, t]));
  // Everything about titles below stays within the section.
  const inSection = new Map(allTitles.filter((t) => sectionOf(t) === category).map((t) => [t.id, t]));

  // What the extension says is playing right now comes first; then the last one opened.
  const liveTitleId = presence && isLive(presence, now) ? presence.titleId : null;
  const continueWatching = library
    .filter((e) => e.status === "watching" && e.progress && inSection.has(e.titleId))
    .sort(
      (a, b) =>
        Number(b.titleId === liveTitleId) - Number(a.titleId === liveTitleId) ||
        Date.parse(b.lastWatchedAt ?? b.progress?.updatedAt ?? "") - Date.parse(a.lastWatchedAt ?? a.progress?.updatedAt ?? ""),
    )
    .map((e) => (titles.get(e.titleId) ? toContinueItem(e, titles.get(e.titleId)!) : null))
    .filter((x): x is ContinueItem => x !== null)
    .map((item) => (item.title.id === liveTitleId ? { ...item, live: true } : item));

  // One line per friend: what they are watching now, else their latest action.
  const byUser = new Map(friends.map((f) => [f.user.id, f.user]));
  const latestPerFriend = new Map<string, ActivityEvent>();
  for (const e of activity) {
    const current = latestPerFriend.get(e.userId);
    if (!current || (e.kind === "watching" && current.kind !== "watching" && Date.parse(e.at) > now.getTime() - LIVE_WINDOW_MS)) {
      latestPerFriend.set(e.userId, e);
    }
  }
  const friendsActivity = [...latestPerFriend.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((event) => ({
      event,
      user: byUser.get(event.userId)!,
      title: titles.get(event.titleId)!,
      live: event.kind === "watching" && Date.parse(event.at) > now.getTime() - LIVE_WINDOW_MS,
    }))
    // Friends shown as watching live are not repeated below.
    .filter((x) => x.user && x.title && !liveIds.has(x.user.id));

  // Suggested party: the friends active most recently.
  const partyFriends = [...liveFriends.map((l) => l.user), ...friendsActivity.map((a) => a.user)].slice(0, 3);
  const partyMembers = [
    toPartyMember(toPublicUser(viewer), library, wishlist),
    ...friends.filter((f) => partyFriends.some((p) => p.id === f.user.id)).map((f) => toPartyMember(f.user, f.library, f.wishlist)),
  ];

  return {
    viewer: toPublicUser(viewer),
    category,
    background: sectionBackground(prefs, category, library, inSection),
    nowWatching: continueWatching[0] ?? null,
    continueWatching: continueWatching.slice(1),
    liveFriends,
    friendsActivity,
    week: computeWeeklyStats({ now, events, library, wishlist, titles }),
    tonight: pickForTonight({ library, wishlist, friends, titles: inSection, subscriptions: prefs.subscriptions, limit: 10 }),
    party: {
      friends: partyFriends,
      compatibleCount: compatibleTitles({ members: partyMembers, titles: allTitles, filter: "all", genre: null }).length,
    },
    wishlistIds: wishlist.map((w) => w.titleId),
    wishlist: wishlist.map((w) => inSection.get(w.titleId)).filter((t): t is Title => Boolean(t)),
    newSeasons: category === "movie" ? [] : await listNewSeasons(repo, library.filter((e) => inSection.has(e.titleId)), inSection, italianDay(now)),
  };
}


/** The title chosen for a section's background, else the one watched there most recently. */
export function sectionBackground(prefs: UserPreferences, category: MediaType, library: readonly LibraryEntry[], inSection: Map<string, Title>): Title | null {
  const chosen = prefs.homeBackgrounds[category];
  if (chosen && inSection.has(chosen)) return inSection.get(chosen)!;
  const last = library
    .filter((e) => inSection.has(e.titleId) && (e.lastWatchedAt || e.progress) && e.status !== "planned")
    .sort((a, b) => Date.parse(b.lastWatchedAt ?? b.progress?.updatedAt ?? "") - Date.parse(a.lastWatchedAt ?? a.progress?.updatedAt ?? ""))[0];
  return last ? inSection.get(last.titleId)! : null;
}
