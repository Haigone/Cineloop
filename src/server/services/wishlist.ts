import "server-only";
import type { Playlist, PublicUser, Title, WishlistItem } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { italianDay } from "@/lib/dates";
import { awaitedReleases, type AwaitedRelease } from "./awaited";
import { loadFriendBundles } from "./shared";

export interface WishlistRow {
  item: WishlistItem;
  title: Title;
  suggestedBy: PublicUser | null;
  /** Friends who also want to see it. */
  friendsWant: PublicUser[];
  /** The season this series is waiting on, when it has not come out yet. */
}

/** A playlist with its titles, ready to show. */
export interface PlaylistView {
  playlist: Playlist;
  titles: Title[];
  /** Who owns it when it is a friend's collaborative playlist; null for the viewer's own. */
  owner: PublicUser | null;
}

/** The wishlist from the database; when each title comes back asks outside services and follows as a promise. */
export async function getWishlistView(): Promise<{ rows: WishlistRow[]; playlists: PlaylistView[]; releases: Promise<Record<string, AwaitedRelease>> }> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [wishlist, friends, own] = await Promise.all([repo.listWishlist(viewer.id), loadFriendBundles(repo, viewer.id), repo.listPlaylists(viewer.id)]);
  // The friends' collaborative playlists are the viewer's to add to as well.
  const collaborative = (await repo.listSharedPlaylists(friends.map((f) => f.user.id))).filter((p) => p.visibility === "collaborative");
  const playlists = [...own, ...collaborative];
  const titles = new Map((await repo.getTitlesByIds([...wishlist.map((w) => w.titleId), ...playlists.flatMap((p) => p.titleIds)])).map((t) => [t.id, t]));
  const byId = new Map(friends.map((f) => [f.user.id, f.user]));
  const releases = awaitedReleases([...titles.values()], italianDay())
    .then((m) => Object.fromEntries(m))
    .catch((): Record<string, AwaitedRelease> => ({}));
  return {
    releases,
    playlists: playlists.map((playlist) => ({ playlist, titles: playlist.titleIds.flatMap((id) => titles.get(id) ?? []), owner: playlist.ownerId === viewer.id ? null : (byId.get(playlist.ownerId) ?? null) })),
    rows: wishlist
      .filter((w) => titles.has(w.titleId))
      .map((item) => ({
        item,
        title: titles.get(item.titleId)!,
        suggestedBy: item.suggestedBy ? (byId.get(item.suggestedBy) ?? null) : null,
        friendsWant: friends.filter((f) => f.wishlist.some((w) => w.titleId === item.titleId)).map((f) => f.user),
      })),
  };
}
