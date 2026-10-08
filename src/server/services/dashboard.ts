import "server-only";
import type { ActivityEvent, PublicUser, Title } from "@/domain/types";
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
  nowWatching: ContinueItem | null;
  continueWatching: ContinueItem[];
  /** Friends watching right now through the extension; they can be joined. */
  liveFriends: LiveFriend[];
  friendsActivity: FriendActivityItem[];
  week: WeeklyStats;
  tonight: TonightPick[];
  party: { friends: PublicUser[]; compatibleCount: number };
  wishlistIds: string[];
}

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function getHomeView(): Promise<HomeView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const now = new Date();

  const [library, wishlist, events, friends] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    repo.listWatchEvents(viewer.id, weekStart(now)),
    loadFriendBundles(repo, viewer.id),
  ]);
  const friendIds = friends.map((f) => f.user.id);
  const [activity, prefs, liveFriends] = await Promise.all([
    listSharedActivity(repo, friendIds, 30),
    repo.getPreferences(viewer.id),
    listLiveFriends(repo, viewer.id, friendIds),
  ]);
  const liveIds = new Set(liveFriends.map((l) => l.user.id));

  const allTitles = await repo.listTitles();
  const titles = new Map(allTitles.map((t) => [t.id, t]));

  const continueWatching = library
    .filter((e) => e.status === "watching" && e.progress)
    .sort((a, b) => Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""))
    .map((e) => (titles.get(e.titleId) ? toContinueItem(e, titles.get(e.titleId)!) : null))
    .filter((x): x is ContinueItem => x !== null);

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
    nowWatching: continueWatching[0] ?? null,
    continueWatching: continueWatching.slice(1),
    liveFriends,
    friendsActivity,
    week: computeWeeklyStats({ now, events, library, wishlist, titles }),
    tonight: pickForTonight({ library, wishlist, friends, titles, subscriptions: prefs.subscriptions, limit: 10 }),
    party: {
      friends: partyFriends,
      compatibleCount: compatibleTitles({ members: partyMembers, titles: allTitles, filter: "all", genre: null }).length,
    },
    wishlistIds: wishlist.map((w) => w.titleId),
  };
}

