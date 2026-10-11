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
  release: AwaitedRelease | null;
}

/** A playlist with its titles, ready to show. */
export interface PlaylistView {
  playlist: Playlist;
  titles: Title[];
}

export async function getWishlistView(): Promise<{ rows: WishlistRow[]; playlists: PlaylistView[] }> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [wishlist, friends, playlists] = await Promise.all([repo.listWishlist(viewer.id), loadFriendBundles(repo, viewer.id), repo.listPlaylists(viewer.id)]);
  const titles = new Map((await repo.getTitlesByIds([...wishlist.map((w) => w.titleId), ...playlists.flatMap((p) => p.titleIds)])).map((t) => [t.id, t]));
  const byId = new Map(friends.map((f) => [f.user.id, f.user]));
  const awaited = await awaitedReleases([...titles.values()], italianDay());
  return {
    playlists: playlists.map((playlist) => ({ playlist, titles: playlist.titleIds.flatMap((id) => titles.get(id) ?? []) })),
    rows: wishlist
      .filter((w) => titles.has(w.titleId))
      .map((item) => ({
        item,
        title: titles.get(item.titleId)!,
        suggestedBy: item.suggestedBy ? (byId.get(item.suggestedBy) ?? null) : null,
        release: awaited.get(item.titleId) ?? null,
        friendsWant: friends.filter((f) => f.wishlist.some((w) => w.titleId === item.titleId)).map((f) => f.user),
      })),
  };
}
