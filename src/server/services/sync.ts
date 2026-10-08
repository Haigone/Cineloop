import "server-only";
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
  const step = nextPresence(userId, await repo.getPresence(userId), seen, now);
  if (step.ended) await storeMinutes(repo, step.ended, remainingMinutes(step.ended), now);

  const presence = step.presence;
  if (step.flushMinutes) await storeMinutes(repo, presence, step.flushMinutes, now);
  if (!presence.titleId) {
    const titleId = await recognise(repo, presence, content.parentId ?? null);
    if (titleId) {
      presence.titleId = titleId;
      await startWatching(repo, presence);
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
  const [user, presence, library, wishlist] = await Promise.all([
    repo.getUserById(userId),
    repo.getPresence(userId),
    repo.listLibrary(userId),
    repo.listWishlist(userId),
  ]);
  if (!user) throw new Error("User not found");

  const candidateIds = [
    ...library.filter((e) => e.status === "watching").sort((a, b) => Date.parse(b.lastWatchedAt ?? "") - Date.parse(a.lastWatchedAt ?? "")).map((e) => e.titleId),
    ...wishlist.map((w) => w.titleId),
  ].slice(0, 6);
  const live = presence && isLive(presence, new Date()) ? presence : null;
  const titleIds = [...candidateIds, ...(live?.titleId ? [live.titleId] : [])];
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
  const sharing = new Set(prefs.filter((p) => p.shareActivity).map((p) => p.userId));
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
  if (!presence || !isLive(presence, new Date())) return { ok: false, error: `${host.displayName} ha appena smesso di guardare.` };

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

/** Learned links first (the show's id covers new episodes), then an exact title match. */
async function recognise(repo: Repository, presence: Presence, parentId: string | null): Promise<string | null> {
  const linked = await repo.findProviderLink(presence.providerId, parentId ? [presence.externalId, parentId] : [presence.externalId]);
  if (linked) return linked;
  if (!presence.label) return null;

  const key = searchKey(presence.label);
  const local = await repo.searchTitles(presence.label, 5);
  let hit = local.find((t) => searchKey(t.title) === key);
  if (!hit && getCatalog().complete) {
    const remote = await getCatalog().search(presence.label, 5).catch(() => []);
    hit = remote.find((t) => searchKey(t.title) === key);
    if (hit) await cacheTitles(repo, [hit]);
  }
  if (!hit) return null;
  await repo.saveProviderLink({ providerId: presence.providerId, externalId: presence.externalId, titleId: hit.id, userId: presence.userId });
  if (parentId && hit.type !== "movie") {
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
