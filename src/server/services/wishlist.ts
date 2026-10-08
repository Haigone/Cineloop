import "server-only";
import type { PublicUser, Title, WishlistItem } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { loadFriendBundles } from "./shared";

export interface WishlistRow {
  item: WishlistItem;
  title: Title;
  suggestedBy: PublicUser | null;
  /** Friends who also want to see it. */
  friendsWant: PublicUser[];
}

export async function getWishlistView(): Promise<{ rows: WishlistRow[] }> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [wishlist, friends] = await Promise.all([repo.listWishlist(viewer.id), loadFriendBundles(repo, viewer.id)]);
  const titles = new Map((await repo.getTitlesByIds(wishlist.map((w) => w.titleId))).map((t) => [t.id, t]));
  const byId = new Map(friends.map((f) => [f.user.id, f.user]));
  return {
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
