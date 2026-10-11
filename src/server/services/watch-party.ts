import "server-only";
import { sourceKey, toPartyMember, type PartyMember, type PartySource } from "@/domain/watch-party";
import type { Title, WatchParty } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { loadFriendBundles, toPublicUser } from "./shared";

export interface WatchPartyView {
  host: PartyMember;
  friends: PartyMember[];
  titles: Title[];
  /** Every list a night can draw from: the wishlists, and the playlists the viewer may use. */
  sources: PartySource[];
  recent: { party: WatchParty; title: Title | null; names: string[] }[];
}

export async function getWatchPartyView(): Promise<WatchPartyView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [library, wishlist, friends, titles, parties, mine] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    repo.listTitles(),
    repo.listWatchParties(viewer.id, 5),
    repo.listPlaylists(viewer.id),
  ]);
  // A friend's playlist is usable only if they shared it with friends.
  const shared = await repo.listSharedPlaylists(friends.map((f) => f.user.id));
  const sources: PartySource[] = [
    { key: sourceKey(viewer.id, "wishlist"), ownerId: viewer.id, kind: "wishlist", label: "Wishlist", titleIds: wishlist.map((w) => w.titleId) },
    ...mine.map((p): PartySource => ({ key: sourceKey(viewer.id, p.id), ownerId: viewer.id, kind: "playlist", label: p.name, titleIds: p.titleIds })),
    ...friends.flatMap((f): PartySource[] => [
      { key: sourceKey(f.user.id, "wishlist"), ownerId: f.user.id, kind: "wishlist", label: "Wishlist", titleIds: f.wishlist.map((w) => w.titleId) },
      ...shared.filter((p) => p.ownerId === f.user.id).map((p): PartySource => ({ key: sourceKey(f.user.id, p.id), ownerId: f.user.id, kind: "playlist", label: p.name, titleIds: p.titleIds })),
    ]),
  ];
  const byId = new Map(titles.map((t) => [t.id, t]));
  const names = new Map(friends.map((f) => [f.user.id, f.user.displayName.split(" ")[0]!]));
  return {
    host: toPartyMember(toPublicUser(viewer), library, wishlist),
    friends: friends.map((f) => toPartyMember(f.user, f.library, f.wishlist)),
    titles,
    sources,
    recent: parties.map((party) => ({
      party,
      title: party.pickedTitleId ? (byId.get(party.pickedTitleId) ?? null) : null,
      names: party.participantIds.filter((id) => id !== viewer.id).map((id) => names.get(id) ?? "Amico"),
    })),
  };
}
