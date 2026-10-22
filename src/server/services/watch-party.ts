import "server-only";
import { sourceKey, toPartyMember, type PartyMember, type PartySource } from "@/domain/watch-party";
import type { Title, WatchParty } from "@/domain/types";
import { firstName } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { activateNights } from "./nights";
import { listSharedWatchViews, type SharedWatchView } from "./shared-watch";
import { loadFriendBundles, toPublicUser } from "./shared";

export interface UpcomingNight {
  party: WatchParty;
  title: Title;
  /** The other people of the night, by first name. */
  names: string[];
  hostedByViewer: boolean;
}

export interface WatchPartyView {
  host: PartyMember;
  friends: PartyMember[];
  titles: Title[];
  /** Every list a night can draw from: the wishlists, the playlists the viewer may use and those published in Community. */
  sources: PartySource[];
  recent: { party: WatchParty; title: Title | null; names: string[] }[];
  /** Nights scheduled or queued, soonest first. */
  upcoming: UpcomingNight[];
  /** Invitations awaiting the viewer's decision. */
  invitations: { party: WatchParty; title: Title; hostName: string }[];
  /** Nights going on now ("Serate insieme"): they can be managed or ended here. */
  running: SharedWatchView[];
}

/** Scheduled and queued nights the user is part of, scheduled ones by date, then the queue in order. */
export async function listUpcomingNights(repo: Repository, userId: string, parties?: WatchParty[]): Promise<UpcomingNight[]> {
  const all = parties ?? (await repo.listWatchParties(userId, 100));
  const waiting = all.filter((p) => (p.hostId === userId || p.participantIds.includes(userId)) && (p.status === "scheduled" || p.status === "queued") && p.pickedTitleId);
  if (waiting.length === 0) return [];
  const titles = new Map((await repo.getTitlesByIds(waiting.map((p) => p.pickedTitleId!))).map((t) => [t.id, t]));
  const people = new Map(
    (await Promise.all([...new Set(waiting.flatMap((p) => p.participantIds))].map((id) => repo.getUserById(id)))).flatMap((u) => (u ? [[u.id, firstName(u.displayName)] as const] : [])),
  );
  return waiting
    .sort((a, b) =>
      a.status !== b.status ? (a.status === "scheduled" ? -1 : 1) : a.status === "scheduled" ? Date.parse(a.scheduledFor ?? "") - Date.parse(b.scheduledFor ?? "") : Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )
    .flatMap((party) => {
      const title = titles.get(party.pickedTitleId!);
      if (!title) return [];
      return [{ party, title, names: party.participantIds.filter((id) => id !== userId).map((id) => people.get(id) ?? "Amico"), hostedByViewer: party.hostId === userId }];
    });
}

export async function getWatchPartyView(): Promise<WatchPartyView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  await activateNights(repo, viewer.id);
  const [library, wishlist, friends, titles, parties, mine, community] = await Promise.all([
    repo.listLibrary(viewer.id),
    repo.listWishlist(viewer.id),
    loadFriendBundles(repo, viewer.id),
    repo.listTitles(),
    repo.listWatchParties(viewer.id, 100),
    repo.listPlaylists(viewer.id),
    repo.listCommunityPlaylists(30),
  ]);
  // A friend's playlist is usable only if they shared it with friends.
  const shared = await repo.listSharedPlaylists(friends.map((f) => f.user.id));
  const owners = new Map(
    (await Promise.all([...new Set(community.map((c) => c.playlist.ownerId))].map((id) => repo.getUserById(id)))).flatMap((u) => (u ? [[u.id, firstName(u.displayName)] as const] : [])),
  );
  const sources: PartySource[] = [
    { key: sourceKey(viewer.id, "wishlist"), ownerId: viewer.id, kind: "wishlist", label: "Wishlist", titleIds: wishlist.map((w) => w.titleId) },
    ...mine.map((p): PartySource => ({ key: sourceKey(viewer.id, p.id), ownerId: viewer.id, kind: "playlist", label: p.name, titleIds: p.titleIds })),
    ...friends.flatMap((f): PartySource[] => [
      { key: sourceKey(f.user.id, "wishlist"), ownerId: f.user.id, kind: "wishlist", label: "Wishlist", titleIds: f.wishlist.map((w) => w.titleId) },
      ...shared.filter((p) => p.ownerId === f.user.id).map((p): PartySource => ({ key: sourceKey(f.user.id, p.id), ownerId: f.user.id, kind: "playlist", label: p.name, titleIds: p.titleIds })),
    ]),
    // Published in Community: anyone's, the viewer's own and friends' already listed above.
    ...community
      .filter((c) => c.playlist.ownerId !== viewer.id && !shared.some((p) => p.id === c.playlist.id))
      .map(({ playlist: p }): PartySource => ({ key: sourceKey("community", p.id), ownerId: p.ownerId, kind: "community", label: p.name, ownerName: owners.get(p.ownerId) ?? "Community", titleIds: p.titleIds })),
  ];
  const byId = new Map(titles.map((t) => [t.id, t]));
  const names = new Map(friends.map((f) => [f.user.id, f.user.displayName.split(" ")[0]!]));
  const invitations = parties
    .filter((party) => party.status !== "done" && (party.pendingParticipantIds ?? []).includes(viewer.id) && party.pickedTitleId)
    .flatMap((party) => {
      const title = byId.get(party.pickedTitleId!);
      if (!title) return [];
      return [{ party, title, hostName: names.get(party.hostId) ?? "Un amico" }];
    });
  return {
    host: toPartyMember(toPublicUser(viewer), library, wishlist),
    friends: friends.map((f) => toPartyMember(f.user, f.library, f.wishlist)),
    titles,
    sources,
    upcoming: await listUpcomingNights(repo, viewer.id, parties),
    invitations,
    running: await listSharedWatchViews(repo, viewer.id, byId),
    recent: parties
      .filter((p) => (p.hostId === viewer.id || p.participantIds.includes(viewer.id)) && p.status !== "scheduled" && p.status !== "queued")
      .slice(0, 5)
      .map((party) => ({
        party,
        title: party.pickedTitleId ? (byId.get(party.pickedTitleId) ?? null) : null,
        names: party.participantIds.filter((id) => id !== viewer.id).map((id) => names.get(id) ?? "Amico"),
      })),
  };
}
