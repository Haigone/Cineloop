import "server-only";
import { applyReport, driftBetween, IN_SYNC_SECONDS, type PlaybackReport } from "@/domain/party";
import { isLive, nextPresence, normalizePartyUrl, remainingMinutes, type Detected } from "@/domain/presence";
import type { Presence, PublicUser, Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getAdapter } from "@/integrations/providers/registry";
import type { SyncObservation } from "@/integrations/providers/types";
import { searchKey } from "@/lib/text";
import { getRepository, type Repository } from "@/server/data";
import { cacheTitles, ensureTitle } from "./explore";
import { toPublicUser } from "./shared";

/**
 * Everything the browser extension drives: turning the page a user is on
 * into "watching now", matching it to the catalog, recording watch time, and
 * letting friends join. Every function takes the user id resolved from the
 * extension's own token, never from the request body.
 */

export interface ExtensionStatus {
  user: { displayName: string; username: string };
  watching: null | {
    label: string | null;
    title: { id: string; title: string; year: number } | null;
    season: number | null;
    episode: number | null;
    partyUrl: string | null;
    guests: string[];
    /** The host, when the user joined a friend from CineLoop and is on the same title. */
    with: string[];
  };
  /** Shortcuts for confirming an unrecognised title: what the user is watching or planned. */
  suggestions: { id: string; title: string; year: number }[];
  /** The user's list for the popup: in progress first (with the episode), then the wishlist. */
  list: { id: string; title: string; year: number; status: "watching" | "wishlist"; season: number | null; episode: number | null }[];
  /** Whether friends see this user live, with "Guarda insieme". */
  visible: boolean;
}

const brief = (t: Title) => ({ id: t.id, title: t.title, year: t.year });

export async function handleObservation(userId: string, obs: SyncObservation): Promise<ExtensionStatus> {
  const repo = getRepository();
  const content = await getAdapter(obs.providerId).getCurrentContent({ userId, latestObservation: obs });
  if (!content?.externalId || !content.url) {
    await endPresence(userId);
    return getExtensionStatus(userId);
  }

  const seen: Detected = {
    providerId: content.providerId,
    externalId: content.externalId,
    label: content.title || null,
    season: content.season,
    episode: content.episode,
    url: content.url,
  };
  const now = new Date();
  const before = await repo.getPresence(userId);
  const step = nextPresence(userId, before, seen, now);
  if (step.ended) await storeMinutes(repo, step.ended, remainingMinutes(step.ended), now);

  const presence = step.presence;
  if (step.flushMinutes) await storeMinutes(repo, presence, step.flushMinutes, now);
  // A new session with nobody in it starts without an old room.
  if (step.started && presence.guestIds.length === 0) await repo.saveParty(userId, null);
  if (!presence.titleId) {
    const titleId = await recognise(repo, presence, content.parentId ?? null);
    if (titleId) {
      presence.titleId = titleId;
      await startWatching(repo, presence);
    }
  } else if (!step.started) {
    // The player's name arrived after the session was matched (by the show page,
    // which can be out of date): the player wins.
    const named = presence.label !== before?.label ? await matchLabel(repo, presence, null) : null;
    if (named && named !== presence.titleId) {
      presence.titleId = named;
      await startWatching(repo, presence);
    } else if (presence.season !== before?.season || presence.episode !== before?.episode) {
      // The player named the episode after the session was matched: keep "Continua a guardare" exact.
      await updateEpisode(repo, presence);
    }
  }
  await repo.savePresence(presence);
  return getExtensionStatus(userId);
}

/** The user picked the title in the popup: remember the match for everyone, then carry on. */
export async function confirmTitle(userId: string, titleId: string, parentId: string | null): Promise<ExtensionStatus | null> {
  const repo = getRepository();
  const presence = await repo.getPresence(userId);
  if (!presence || !isLive(presence, new Date())) return null;
  const title = await ensureTitle(titleId);
  if (!title) return null;

  // Series episodes have their own ids; the show id covers the episodes not seen yet.
  const ids = [presence.externalId, ...(parentId && title.type !== "movie" ? [parentId] : [])];
  for (const externalId of ids) await repo.saveProviderLink({ providerId: presence.providerId, externalId, titleId, userId });

  const changed = presence.titleId !== titleId;
  presence.titleId = titleId;
  if (changed) await startWatching(repo, presence);
  await repo.savePresence(presence);
  return getExtensionStatus(userId);
}

export async function endPresence(userId: string): Promise<void> {
  const repo = getRepository();
  const presence = await repo.getPresence(userId);
  if (!presence) return;
  const now = new Date();
  const gap = isLive(presence, now) ? Math.min((now.getTime() - Date.parse(presence.updatedAt)) / 60_000, 2) : 0;
  await storeMinutes(repo, presence, remainingMinutes({ ...presence, pendingMinutes: presence.pendingMinutes + gap }), now);
  await repo.clearPresence(userId);
  await repo.saveParty(userId, null);
}

/** Shares (or clears) a watch-together room link with friends who join. */
export async function setPartyUrl(userId: string, input: string | null): Promise<{ ok: boolean }> {
  const repo = getRepository();
  const presence = await repo.getPresence(userId);
  if (!presence || !isLive(presence, new Date())) return { ok: false };
  const partyUrl = input ? normalizePartyUrl(input) : null;
  if (input && !partyUrl) return { ok: false };
  await repo.savePresence({ ...presence, partyUrl });
  return { ok: true };
}

export async function getExtensionStatus(userId: string): Promise<ExtensionStatus> {
  const repo = getRepository();
  const [user, presence, library, wishlist, prefs] = await Promise.all([
    repo.getUserById(userId),
    repo.getPresence(userId),
    repo.listLibrary(userId),
    repo.listWishlist(userId),
    repo.getPreferences(userId),
  ]);
  if (!user) throw new Error("User not found");

  const inProgress = library
    .filter((e) => e.status === "watching")
    .sort((a, b) => Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? ""));
  const candidateIds = [...inProgress.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)].slice(0, 6);
  const listEntries = [
    ...inProgress.slice(0, 6).map((e) => ({ id: e.titleId, status: "watching" as const, season: e.progress?.season ?? null, episode: e.progress?.episode ?? null })),
    ...wishlist.slice(0, 6).map((w) => ({ id: w.titleId, status: "wishlist" as const, season: null, episode: null })),
  ];
  const live = presence && isLive(presence, new Date()) ? presence : null;
  const titleIds = [...new Set([...candidateIds, ...listEntries.map((e) => e.id), ...(live?.titleId ? [live.titleId] : [])])];
  const titles = new Map((await repo.getTitlesByIds(titleIds)).map((t) => [t.id, t]));

  let watching: ExtensionStatus["watching"] = null;
  if (live) {
    const people = await Promise.all(live.guestIds.map((id) => repo.getUserById(id)));
    // Joined a friend who is still on the same title: show who you are with.
    const hosts = live.titleId ? await hostsWatching(repo, userId, live.titleId) : [];
    const title = live.titleId ? titles.get(live.titleId) : undefined;
    watching = {
      label: live.label,
      title: title ? brief(title) : null,
      season: live.season,
      episode: live.episode,
      partyUrl: live.partyUrl,
      guests: people.filter((p) => p !== null).map((p) => p.displayName),
      with: hosts,
    };
  }

  return {
    user: { displayName: user.displayName, username: user.username },
    watching,
    suggestions: candidateIds.map((id) => titles.get(id)).filter((t): t is Title => Boolean(t)).map(brief),
    list: listEntries.flatMap((e) => {
      const t = titles.get(e.id);
      return t ? [{ ...brief(t), status: e.status, season: e.season, episode: e.episode }] : [];
    }),
    visible: prefs.liveVisible,
  };
}

/** The popup's "Visibile agli amici" switch. */
export async function setLiveVisible(userId: string, visible: boolean): Promise<void> {
  await getRepository().updatePreferences(userId, { liveVisible: visible });
}

export interface PartyView {
  hostName: string;
  isHost: boolean;
  /** Everyone else in the room. */
  members: string[];
  /** The room's play/pause state and its sequence number, applied once by each player. */
  paused: boolean;
  seq: number;
  byYou: boolean;
  byName: string;
  /** False when you are on a different episode than the host: nothing is applied. */
  sameEpisode: boolean;
  /** Who is noticeably ahead (+ seconds) or behind (−) you. */
  offsets: { name: string; seconds: number }[];
}

/**
 * A member's player report, every couple of seconds while they are watching.
 * Returns the room they are in (hosting, or a friend's they joined), or null.
 */
export async function reportPlayback(userId: string, report: PlaybackReport): Promise<{ party: PartyView | null }> {
  const repo = getRepository();
  const now = new Date();
  const me = await repo.getPresence(userId);
  if (!me || !isLive(me, now)) return { party: null };

  let host: Presence | null = me.guestIds.length > 0 ? me : null;
  if (!host) {
    const friends = await repo.listFriends(userId);
    const presences = await repo.listPresence(friends.map((f) => f.user.id));
    host = presences.find((p) => isLive(p, now) && p.guestIds.includes(userId)) ?? null;
  }
  if (!host) return { party: null };

  const party = applyReport(await repo.getParty(host.userId), userId, report, now);
  await repo.saveParty(host.userId, party);

  const memberIds = [host.userId, ...host.guestIds];
  const users = new Map((await Promise.all(memberIds.map((id) => repo.getUserById(id)))).flatMap((u) => (u ? [[u.id, u] as const] : [])));
  const name = (id: string) => users.get(id)?.displayName ?? "Un amico";
  const offsets = memberIds
    .filter((id) => id !== userId)
    .map((id) => ({ name: name(id), seconds: driftBetween(party, id, userId, now) }))
    .filter((o): o is { name: string; seconds: number } => o.seconds !== null && Math.abs(o.seconds) >= IN_SYNC_SECONDS);

  return {
    party: {
      hostName: name(host.userId),
      isHost: host.userId === userId,
      members: memberIds.filter((id) => id !== userId).map(name),
      paused: party.paused,
      seq: party.seq,
      byYou: party.by === userId,
      byName: name(party.by),
      sameEpisode: report.externalId === host.externalId,
      offsets,
    },
  };
}

/** Catalog search for the popup's "Che cosa stai guardando?" box. */
export async function searchForExtension(query: string): Promise<{ id: string; title: string; year: number }[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const repo = getRepository();
  const local = await repo.searchTitles(q, 8);
  let titles = local;
  if (local.length < 8 && getCatalog().complete) {
    const remote = await getCatalog().search(q, 8).catch(() => []);
    await cacheTitles(repo, remote);
    const seen = new Set(local.map((t) => t.id));
    titles = [...local, ...remote.filter((t) => !seen.has(t.id))].slice(0, 8);
  }
  return titles.map(brief);
}

// Watch together -------------------------------------------------------------

export interface LiveFriend {
  user: PublicUser;
  title: Title | null;
  label: string | null;
  season: number | null;
  episode: number | null;
  providerId: Presence["providerId"];
  url: string;
  partyUrl: string | null;
  guestCount: number;
  joined: boolean;
  since: string;
}

/** Friends watching something right now, for the dashboard. Respects "share activity". */
export async function listLiveFriends(repo: Repository, viewerId: string, friendIds: readonly string[]): Promise<LiveFriend[]> {
  if (friendIds.length === 0) return [];
  const now = new Date();
  const [presences, prefs] = await Promise.all([
    repo.listPresence(friendIds),
    Promise.all(friendIds.map((id) => repo.getPreferences(id))),
  ]);
  const sharing = new Set(prefs.filter((p) => p.shareActivity && p.liveVisible).map((p) => p.userId));
  const live = presences.filter((p) => sharing.has(p.userId) && isLive(p, now));
  if (live.length === 0) return [];

  const [users, titles] = await Promise.all([
    Promise.all(live.map((p) => repo.getUserById(p.userId))),
    repo.getTitlesByIds(live.flatMap((p) => (p.titleId ? [p.titleId] : []))),
  ]);
  const byId = new Map(titles.map((t) => [t.id, t]));
  return live
    .map((p, i): LiveFriend | null => {
      const user = users[i];
      if (!user) return null;
      return {
        user: toPublicUser(user),
        title: p.titleId ? (byId.get(p.titleId) ?? null) : null,
        label: p.label,
        season: p.season,
        episode: p.episode,
        providerId: p.providerId,
        url: p.url,
        partyUrl: p.partyUrl,
        guestCount: p.guestIds.length,
        joined: p.guestIds.includes(viewerId),
        since: p.startedAt,
      };
    })
    .filter((x): x is LiveFriend => x !== null)
    .sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
}

export type JoinResult =
  | { ok: true; url: string; partyUrl: string | null; hostName: string }
  | { ok: false; error: string };

/** Joins a friend's session: they see you in their extension and get a notification. */
export async function joinFriend(viewer: PublicUser, hostId: string): Promise<JoinResult> {
  const repo = getRepository();
  const friends = await repo.listFriends(viewer.id);
  const host = friends.find((f) => f.user.id === hostId)?.user;
  if (!host) return { ok: false, error: "Puoi unirti solo ai tuoi amici." };
  const presence = await repo.getPresence(hostId);
  if (!presence || !isLive(presence, new Date()) || !(await repo.getPreferences(hostId)).liveVisible) {
    return { ok: false, error: `${host.displayName} ha appena smesso di guardare.` };
  }

  if (!presence.guestIds.includes(viewer.id)) {
    await repo.savePresence({ ...presence, guestIds: [...presence.guestIds, viewer.id] });
    if ((await repo.getPreferences(hostId)).notifyWatchParty) {
      const [title] = presence.titleId ? await repo.getTitlesByIds([presence.titleId]) : [];
      const what = title?.title ?? presence.label;
      await repo.createNotification({
        userId: hostId,
        kind: "watch-party",
        message: what ? `${viewer.displayName} si è unito a te per ${what}.` : `${viewer.displayName} si è unito a te.`,
        href: `/friends/${viewer.username}`,
        at: new Date().toISOString(),
      });
    }
  }
  return { ok: true, url: presence.url, partyUrl: presence.partyUrl, hostName: host.displayName };
}

// Internals ------------------------------------------------------------------

/**
 * This episode's learned link first, then the name the player shows, then the
 * show's learned link (it covers episodes nobody has watched yet, but the
 * show page the user came from can be out of date; the player is not).
 */
async function recognise(repo: Repository, presence: Presence, parentId: string | null): Promise<string | null> {
  const linked = await repo.findProviderLink(presence.providerId, [presence.externalId]);
  if (linked) return linked;
  const named = presence.label ? await matchLabel(repo, presence, parentId) : null;
  if (named) return named;
  return parentId ? repo.findProviderLink(presence.providerId, [parentId]) : null;
}

async function matchLabel(repo: Repository, presence: Presence, parentId: string | null): Promise<string | null> {
  if (!presence.label) return null;

  const key = searchKey(presence.label);
  const local = await repo.searchTitles(presence.label, 5);
  // With a season and episode it is a series: never a film of the same name.
  const fits = (t: Title) => searchKey(t.title) === key && (presence.season === null || t.type !== "movie");
  let hit = local.find(fits);
  if (!hit && getCatalog().complete) {
    const remote = await getCatalog().search(presence.label, 5).catch(() => []);
    hit = remote.find(fits);
    if (hit) await cacheTitles(repo, [hit]);
  }
  if (!hit) return null;
  await repo.saveProviderLink({ providerId: presence.providerId, externalId: presence.externalId, titleId: hit.id, userId: presence.userId });
  // The show page the user came from may be stale: only teach it when nothing is known about it yet.
  if (parentId && hit.type !== "movie" && !(await repo.findProviderLink(presence.providerId, [parentId]))) {
    await repo.saveProviderLink({ providerId: presence.providerId, externalId: parentId, titleId: hit.id, userId: presence.userId });
  }
  return hit.id;
}

/** First time a session is matched to a title: it goes to "In corso" and friends see it. */
async function startWatching(repo: Repository, presence: Presence): Promise<void> {
  const titleId = presence.titleId!;
  const library = await repo.listLibrary(presence.userId);
  const entry = library.find((e) => e.titleId === titleId);
  const at = new Date().toISOString();
  if (entry?.status !== "completed") {
    const sameEpisode = entry?.progress && entry.progress.season === presence.season && entry.progress.episode === presence.episode;
    await repo.saveProgress(presence.userId, {
      titleId,
      providerId: presence.providerId,
      season: presence.season,
      episode: presence.episode,
      fraction: sameEpisode ? entry!.progress!.fraction : 0,
      url: presence.url,
      updatedAt: at,
    });
    await repo.removeFromWishlist(presence.userId, titleId);
  }
  await repo.recordActivity({
    userId: presence.userId,
    kind: "watching",
    titleId,
    at,
    season: presence.season,
    episode: presence.episode,
    rating: null,
  });
}

async function updateEpisode(repo: Repository, presence: Presence): Promise<void> {
  const entry = (await repo.listLibrary(presence.userId)).find((e) => e.titleId === presence.titleId);
  if (!entry || entry.status === "completed") return;
  await repo.saveProgress(presence.userId, {
    titleId: presence.titleId!,
    providerId: presence.providerId,
    season: presence.season,
    episode: presence.episode,
    fraction: 0,
    url: presence.url,
    updatedAt: new Date().toISOString(),
  });
}

async function storeMinutes(repo: Repository, p: Presence, minutes: number, now: Date): Promise<void> {
  if (!p.titleId || minutes < 1) return;
  await repo.addWatchEvent({
    userId: p.userId,
    titleId: p.titleId,
    watchedAt: now.toISOString(),
    minutes: Math.round(minutes),
    season: p.season,
    episode: p.episode,
    providerId: p.providerId,
  });
}

/** Friends this user joined who are on the same title right now. */
async function hostsWatching(repo: Repository, userId: string, titleId: string): Promise<string[]> {
  const friends = await repo.listFriends(userId);
  const presences = await repo.listPresence(friends.map((f) => f.user.id));
  const now = new Date();
  return presences
    .filter((p) => isLive(p, now) && p.titleId === titleId && p.guestIds.includes(userId))
    .map((p) => friends.find((f) => f.user.id === p.userId)!.user.displayName);
}
