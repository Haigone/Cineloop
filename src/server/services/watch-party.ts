import "server-only";
import { toPartyMember, type PartyMember } from "@/domain/watch-party";
import type { Title, WatchParty } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { loadFriendBundles, toPublicUser } from "./shared";

export interface WatchPartyView {
  host: PartyMember;
  friends: PartyMember[];
  titles: Title[];
  recent: { party: WatchParty; title: Title | null; names: string[] }[];
}

export async function getWatchPartyView(): Promise<WatchPartyView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const [library, wishlist, friends, titles, parties] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    repo.listTitles(),
    repo.listWatchParties(viewer.id, 5),
  ]);
  const byId = new Map(titles.map((t) => [t.id, t]));
  const names = new Map(friends.map((f) => [f.user.id, f.user.displayName.split(" ")[0]!]));
  return {
    host: toPartyMember(toPublicUser(viewer), library, wishlist),
    friends: friends.map((f) => toPartyMember(f.user, f.library, f.wishlist)),
    titles,
    recent: parties.map((party) => ({
      party,
      title: party.pickedTitleId ? (byId.get(party.pickedTitleId) ?? null) : null,
      names: party.participantIds.filter((id) => id !== viewer.id).map((id) => names.get(id) ?? "Amico"),
    })),
  };
}
