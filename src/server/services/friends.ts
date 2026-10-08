import "server-only";
import { compare, genreProfile, topGenres, type Comparison } from "@/domain/compare";
import type { ActivityEvent, Genre, LibraryEntry, PublicUser, Title, WishlistItem } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import type { FriendActivityItem } from "./dashboard";
import { listSharedActivity, loadFriendBundles, toPublicUser } from "./shared";

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

export interface FriendSummary {
  user: PublicUser;
  since: string;
  latest: FriendActivityItem | null;
  compatibility: number;
  commonCount: number;
  topGenres: Genre[];
}

export interface FriendsView {
  friends: FriendSummary[];
  feed: FriendActivityItem[];
  suggestion: PublicUser | null;
}

function toItem(e: ActivityEvent, users: Map<string, PublicUser>, titles: Map<string, Title>, now: number): FriendActivityItem | null {
  const user = users.get(e.userId);
  const title = titles.get(e.titleId);
  if (!user || !title) return null;
  return { event: e, user, title, live: e.kind === "watching" && Date.parse(e.at) > now - LIVE_WINDOW_MS };
}

export async function getFriendsView(): Promise<FriendsView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const now = Date.now();
  const [library, wishlist, friends, allTitles] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    repo.listTitles(),
  ]);
  const titles = new Map(allTitles.map((t) => [t.id, t]));
  const users = new Map(friends.map((f) => [f.user.id, f.user]));
  const activity = await listSharedActivity(repo, [...users.keys()], 40);
  const feed = activity.map((e) => toItem(e, users, titles, now)).filter((x): x is FriendActivityItem => x !== null);

  const summaries = friends.map((f) => {
    const cmp = compare({ library, wishlist }, { library: f.library, wishlist: f.wishlist }, titles);
    const latest = feed.find((x) => x.user.id === f.user.id && x.live) ?? feed.find((x) => x.user.id === f.user.id) ?? null;
    return {
      user: f.user,
      since: f.since,
      latest,
      compatibility: cmp.compatibility,
      commonCount: cmp.common.length,
      topGenres: topGenres(genreProfile(f.library, titles), 3),
    };
  });

  // Live first, then most compatible.
  summaries.sort((a, b) => Number(Boolean(b.latest?.live)) - Number(Boolean(a.latest?.live)) || b.compatibility - a.compatibility);

  return { friends: summaries, feed: feed.slice(0, 12), suggestion: null };
}

export interface FriendProfileView {
  viewer: PublicUser;
  friend: PublicUser;
  isFriend: boolean;
  since: string | null;
  comparison: Comparison;
  watching: { entry: LibraryEntry; title: Title }[];
  wishlist: { item: WishlistItem; title: Title }[];
  topRated: { entry: LibraryEntry; title: Title }[];
  recent: FriendActivityItem[];
  viewerWishlistIds: string[];
}

export async function getFriendProfile(username: string): Promise<FriendProfileView | null> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const friendUser = await repo.getUserByUsername(username);
  if (!friendUser || friendUser.id === viewer.id) return null;

  const [myLibrary, myWishlist, theirLibrary, theirWishlist, myFriends, allTitles, activity, prefs] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    repo.listLibrary(friendUser.id),
    repo.listWishlist(friendUser.id),
    repo.listFriends(viewer.id),
    repo.listTitles(),
    listSharedActivity(repo, [friendUser.id], 8),
    repo.getPreferences(friendUser.id),
  ]);
  const friendship = myFriends.find((f) => f.user.id === friendUser.id) ?? null;
  // Respect the other person's privacy setting.
  const visible = prefs.profileVisibility === "public" || (prefs.profileVisibility === "friends" && friendship);
  const titles = new Map(allTitles.map((t) => [t.id, t]));
  const friend = toPublicUser(friendUser);
  const lib = visible ? theirLibrary : [];
  const wl = visible ? theirWishlist : [];
  const withTitle = <T extends { titleId: string }>(xs: T[]) => xs.filter((x) => titles.has(x.titleId));

  return {
    viewer: toPublicUser(viewer),
    friend,
    isFriend: Boolean(friendship),
    since: friendship?.since ?? null,
    comparison: compare({ library: myLibrary, wishlist: myWishlist }, { library: lib, wishlist: wl }, titles),
    watching: withTitle(lib.filter((e) => e.status === "watching")).map((entry) => ({ entry, title: titles.get(entry.titleId)! })),
    wishlist: withTitle(wl).map((item) => ({ item, title: titles.get(item.titleId)! })),
    topRated: withTitle(lib.filter((e) => e.rating != null))
      .sort((a, b) => b.rating! - a.rating!)
      .slice(0, 6)
      .map((entry) => ({ entry, title: titles.get(entry.titleId)! })),
    recent: visible
      ? activity
          .map((e) => toItem(e, new Map([[friend.id, friend]]), titles, Date.now()))
          .filter((x): x is FriendActivityItem => x !== null)
      : [],
    viewerWishlistIds: myWishlist.map((w) => w.titleId),
  };
}
