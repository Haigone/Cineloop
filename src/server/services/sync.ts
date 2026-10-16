import "server-only";
import { applyReport, driftBetween, hostPosition, IN_SYNC_SECONDS, roomPosition, watchAt, type PlaybackReport } from "@/domain/party";
import { inferSeason, isLive, seasonFromLabel, nextPresence, normalizePartyUrl, remainingMinutes, type Detected } from "@/domain/presence";
import { CONSENT_PROVIDERS, isConsentProvider, type ConsentProvider, type Presence, type PublicUser, type Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { getAdapter } from "@/integrations/providers/registry";
import type { SyncObservation } from "@/integrations/providers/types";
import { plainQuotes, searchKey } from "@/lib/text";
import { italianDay } from "@/lib/dates";
import { finishesTitle } from "@/domain/library";
import { getRepository, type Repository } from "@/server/data";
import { cacheTitles, canonical, ensureTitle } from "./explore";
import { toPublicUser } from "./shared";
import { shareProgress } from "./shared-watch";

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
    title: { id: string; title: string; year: number; artwork?: { posterUrl: string | null } } | null;
    /** Actual provider detected from the active browser tab, not catalog availability. */
    providerId: Presence["providerId"];
    season: number | null;
    episode: number | null;
    /** The series' season numbers, for asking which one when the player does not say. */
    seasons: number[];
    partyUrl: string | null;
    guests: string[];
    /** The host, when the user joined a friend from CineLoop and is on the same title. */
    with: string[];
  };
  /** A service waiting for the user to answer its notice on the site; the popup points there. */
  consent: ConsentProvider | null;
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
  // Unlicensed streaming sites are read only after the user accepted the notice on the site.
  // The first sighting makes the notice appear; nothing from the page is kept meanwhile.
  if (isConsentProvider(obs.providerId)) {
    const prefs = await repo.getPreferences(userId);
    const answer = prefs.providerConsent[obs.providerId];
    if (answer !== "accepted") {
      if (!answer) await repo.updatePreferences(userId, { providerConsent: { ...prefs.providerConsent, [obs.providerId]: "pending" } });
      await endPresence(userId);
      return getExtensionStatus(userId);
    }
  }
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
  const fraction = obs.hints?.progress ?? null;
  const now = new Date();
  const before = await repo.getPresence(userId);
  const step = nextPresence(userId, before, seen, now);
  if (step.ended) await storeMinutes(repo, step.ended, remainingMinutes(step.ended), now);

  const presence = step.presence;
  if (step.flushMinutes) await storeMinutes(repo, presence, step.flushMinutes, now);
  // A new session with nobody in it starts without an old room.
  if (step.started && presence.guestIds.length === 0) await repo.saveParty(userId, null);
  if (!presence.titleId) {
    const recognised = await recognise(repo, presence, content.parentId ?? null);
    const titleId = recognised && (await inYourNight(repo, userId, recognised));
    if (titleId) {
      presence.titleId = titleId;
      await startWatching(repo, presence, fraction);
    }
  } else if (!step.started) {
    // The player's name arrived after the session was matched (by the show page,
    // which can be out of date): the player wins.
    const label = presence.label !== before?.label ? await matchLabel(repo, presence, null) : null;
    const named = label && (await inYourNight(repo, userId, label));
    if (named && named !== presence.titleId) {
      presence.titleId = named;
      await startWatching(repo, presence, fraction);
    } else {
      // Episode and position as the player reports them, every heartbeat.
      await syncProgress(repo, presence, fraction);
    }
  }
  // Learn provider episode IDs only when both the local season/episode and provider episode ID are explicit.
  // The repository stores one anchor per season and enables arithmetic only after adjacent IDs verify a +1 sequence.
  const observedEpisodeId = obs.hints?.episodeId;
  if (
    presence.titleId &&
    observedEpisodeId &&
    Number.isSafeInteger(presence.season) && (presence.season ?? 0) > 0 &&
    Number.isSafeInteger(presence.episode) && (presence.episode ?? 0) > 0
  ) {
    await repo.saveObservedEpisodeLink({
      providerId: presence.providerId,
      titleId: presence.titleId,
      seasonNumber: presence.season!,
      episodeNumber: presence.episode!,
      externalId: observedEpisodeId,
    });
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

/**
 * The user said which season the episode on screen belongs to (Netflix's
 * player often shows only "E4"). Later episodes follow on from it.
 */
export async function setSeason(userId: string, season: number): Promise<ExtensionStatus | null> {
  const repo = getRepository();
  const presence = await repo.getPresence(userId);
  if (!presence?.titleId || !isLive(presence, new Date())) return null;
  const [title] = await repo.getTitlesByIds([presence.titleId]);
  if (!title || title.type === "movie" || !Number.isInteger(season) || season < 1 || season > 200) return null;
  presence.season = season;
  await syncProgress(repo, presence, null);
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
    // The popup's Watchlist tab shows the whole wishlist, in the user's order.
    ...wishlist.slice(0, 60).map((w) => ({ id: w.titleId, status: "wishlist" as const, season: null, episode: null })),
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
      title: title ? { ...brief(title), artwork: { posterUrl: title.artwork.posterUrl } } : null,
      providerId: live.providerId,
      season: live.season,
      episode: live.episode,
      seasons: title && title.type !== "movie" ? title.seasons.map((x) => x.number) : [],
      partyUrl: live.partyUrl,
      guests: people.filter((p) => p !== null).map((p) => p.displayName),
      with: hosts,
    };
  }

  return {
    user: { displayName: user.displayName, username: user.username },
    watching,
    consent: CONSENT_PROVIDERS.find((id) => prefs.providerConsent[id] === "pending") ?? null,
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
  /** Where every player should be: the room's clock, now, in seconds. */
  position: number;
  /** Whether the room is paused, and how many play/pause/seek there were. */
  paused: boolean;
  seq: number;
  byYou: boolean;
  byName: string;
  lastAction: "play" | "pause" | "seek" | null;
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
  // The extension reports the active HTML5 player for supported providers.
  // Never synchronize different services just because their numeric IDs match.
  if (!host || me.providerId !== host.providerId || !["netflix", "animeunity", "streamingcommunity"].includes(host.providerId)) return { party: null };

  const party = applyReport(await repo.getParty(host.userId), userId, report, now, host.userId);
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
      position: roomPosition(party, now),
      paused: party.paused,
      seq: party.seq,
      byYou: party.by === userId,
      byName: name(party.by),
      lastAction: party.last ?? null,
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
  // On Netflix the link starts where the host is now; the extension keeps you there.
  const url = presence.providerId === "netflix" ? watchAt(presence.url, hostPosition(await repo.getParty(hostId), hostId, presence.externalId, new Date())) : presence.url;
  return { ok: true, url, partyUrl: presence.partyUrl, hostName: host.displayName };
}

// Internals ------------------------------------------------------------------

/**
 * A title the user follows in a "Serata insieme" is that one, even when the
 * player's name matched another copy of it (another language, another
 * catalogue entry): otherwise it would be tracked twice, together and alone.
 */
async function inYourNight(repo: Repository, userId: string, titleId: string): Promise<string> {
  const groups = await repo.listSharedWatches(userId);
  if (groups.length === 0 || groups.some((g) => g.titleId === titleId)) return titleId;
  const titles = await repo.getTitlesByIds([titleId, ...groups.map((g) => g.titleId)]);
  const found = titles.find((t) => t.id === titleId);
  if (!found) return titleId;
  const key = searchKey(found.title);
  const same = titles.find((t) => t.id !== titleId && searchKey(t.title) === key && (t.type === "movie") === (found.type === "movie"));
  return same?.id ?? titleId;
}

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

  // Anime services often publish each season as a separate entry. A player
  // label such as "Frieren: Beyond Journey's End 2" should first resolve the
  // base series title, then use the trailing number as a season hint if valid.
  const seasonSuffix = /(?:\s+|[:：]\s*)(?:season\s*)?(\d{1,2})\s*$/i.exec(presence.label);
  const rawBaseLabel = plainQuotes(seasonSuffix ? presence.label.slice(0, seasonSuffix.index).trim() : presence.label);
  // AnimeUnity labels Re:ZERO's director's-cut edition with its Japanese title,
  // while CineLoop's catalogue uses the English franchise title. Treat both as
  // the same work so episode/progress updates land on the existing S1 entry.
  const baseLabel = presence.providerId === "animeunity" &&
    /^re\s*:?\s*zero kara hajimeru isekai seikatsu(?:\s*:\s*shin henshuu-ban)?$/i.test(rawBaseLabel)
      ? "Re:ZERO -Starting Life in Another World-"
      : rawBaseLabel;
  const key = searchKey(baseLabel);
  const local = await repo.searchTitles(baseLabel, 12);
  // With an episode number it is a series: never a film of the same name.
  const fits = (t: Title) => searchKey(t.title) === key && (presence.season === null && presence.episode === null && !seasonSuffix || t.type !== "movie");
  const exactLocal = local.filter(fits);
  // AnimeUnity commonly exposes the original long-running anime as one page
  // with absolute episode numbers. When multiple catalog entries share the
  // exact same name, don't accidentally select a recent sequel/part (e.g.
  // Bleach: Thousand-Year Blood War) just because it sorts first.
  exactLocal.sort((a, b) => {
    if (presence.providerId === "animeunity" && a.type !== "movie" && b.type !== "movie") {
      return a.year - b.year;
    }
    return 0;
  });
  let hit: Title | undefined = exactLocal[0];
  if (!hit) {
    const catalog = getCatalog();
    const series = presence.season !== null || presence.episode !== null || Boolean(seasonSuffix);
    // Prefer an exact provider-aware match, but don't let a provider availability
    // lookup prevent recognition when the title itself exists in the catalogue.
    const remote = await catalog
      .findByName(baseLabel, { series, provider: presence.providerId })
      .catch(() => null);
    let candidates: Title[] = remote ? [remote] : [];
    if (!candidates.length) {
      candidates = await catalog.search(baseLabel, 12).catch(() => []);
    }
    const exactMatches = candidates.filter((t) => searchKey(t.title) === key && (!series || t.type !== "movie"));
    exactMatches.sort((a, b) => {
      if (presence.providerId === "animeunity" && a.type !== "movie" && b.type !== "movie") {
        return a.year - b.year;
      }
      return 0;
    });
    const exact = exactMatches[0];
    const startsWith = candidates.find((t) => {
      const candidate = searchKey(t.title);
      return (!series || t.type !== "movie") && (candidate.startsWith(key) || key.startsWith(candidate));
    });
    const candidate = exact ?? startsWith ?? (series ? candidates.find((t) => t.type !== "movie") : undefined);
    hit = candidate ? (await canonical(repo, [candidate]))[0] : undefined;
    if (hit) {
      await cacheTitles(repo, [hit]);
      // Search results carry no seasons: fetch details so season numbers are accurate.
      hit = (await ensureTitle(hit.id)) ?? hit;
    }
  }
  if (!hit) return null;
  // A trailing number in the player title is an explicit season hint (for example,
  // "Frieren: Beyond Journey's End 2"). Prefer it over inferSeason's single-season
  // default: catalogues can lag behind a newly released season or omit its metadata.
  if (seasonSuffix && hit.type !== "movie") {
    presence.season = Number(seasonSuffix[1]);
  }
  await repo.saveProviderLink({ providerId: presence.providerId, externalId: presence.externalId, titleId: hit.id, userId: presence.userId });
  // The show page the user came from may be stale: only teach it when nothing is known about it yet.
  if (parentId && hit.type !== "movie" && !(await repo.findProviderLink(presence.providerId, [parentId]))) {
    await repo.saveProviderLink({ providerId: presence.providerId, externalId: parentId, titleId: hit.id, userId: presence.userId });
  }
  return hit.id;
}

/** First time a session is matched to a title: it goes to "In corso" (even if seen before) and friends see it. */
async function startWatching(repo: Repository, presence: Presence, fraction: number | null = null): Promise<void> {
  const titleId = presence.titleId!;
  await syncProgress(repo, presence, fraction);
  await repo.removeFromWishlist(presence.userId, titleId);
  await repo.recordActivity({
    userId: presence.userId,
    kind: "watching",
    titleId,
    at: new Date().toISOString(),
    season: presence.season,
    episode: presence.episode,
    rating: null,
  });
}

/**
 * Keeps the library in step with the player: "In corso", season, episode and
 * how far into it. Watching a title marked as seen (a rewatch, a new season)
 * puts it back in progress. Writes only when something changed.
 */
async function syncProgress(repo: Repository, presence: Presence, fraction: number | null): Promise<void> {
  const titleId = presence.titleId!;
  const [entry, title] = await Promise.all([
    repo.listLibrary(presence.userId).then((l) => l.find((e) => e.titleId === titleId)),
    // With its seasons: a series recognised from a search result gets them here.
    ensureTitle(titleId),
  ]);
  const prev = entry?.progress ?? null;
  // A series episode the player has not named yet: keep the last known season
  // and episode (the next heartbeats bring the new ones), only the link moves.
  if (title && title.type !== "movie" && presence.episode === null && prev) {
    if (entry?.status !== "watching" || prev.url !== presence.url) {
      await repo.saveProgress(presence.userId, { ...prev, providerId: presence.providerId, url: presence.url, updatedAt: new Date().toISOString() });
    }
    return;
  }
  // A part named in the player's title ("JoJo: Stone Ocean") is that season,
  // even when the service numbers the part as a show of its own ("S1:E3").
  const named = title ? seasonFromLabel(title, presence.label) : null;
  if (named !== null) presence.season = named;
  if (presence.season === null && presence.episode !== null && title) {
    if (presence.providerId === "animeunity" && title.type !== "movie" && title.seasons.length > 1) {
      // AnimeUnity's classic series pages number episodes across the whole run
      // (e.g. Bleach episode 310), while the catalog stores episodes per season.
      // Convert the absolute episode into the catalog season by cumulative counts.
      let through = 0;
      const absoluteSeason = [...title.seasons]
        .sort((a, b) => a.number - b.number)
        .find((season) => {
          through += season.episodeCount;
          return presence.episode! <= through;
        });
      presence.season = absoluteSeason?.number ?? null;
    }
    if (presence.season === null) presence.season = inferSeason(title, prev, presence.episode);
  }
  const sameEpisode = Boolean(prev && prev.season === presence.season && prev.episode === presence.episode);
  const next = fraction ?? (sameEpisode ? prev!.fraction : 0);
  if (title) {
    const today = italianDay();
    const at = { season: presence.season, episode: presence.episode, fraction: next };
    // Still on the end credits of something just finished: it stays seen. Starting it over is a rewatch.
    if (entry?.status === "completed" && finishesTitle(title, { ...at, fraction: 1 }, today, entry?.partOverrides) && (fraction === null || fraction >= 0.5)) return;
    if (finishesTitle(title, at, today, entry?.partOverrides)) {
      await repo.markFinished(presence.userId, titleId, title.type === "movie" ? null : presence.season);
      await shareProgress(repo, presence.userId, titleId, "finished");
      await repo.recordActivity({ userId: presence.userId, kind: "completed", titleId, at: new Date().toISOString(), season: null, episode: null, rating: null });
      return;
    }
  }
  const unchanged = entry?.status === "watching" && sameEpisode && Math.abs(prev!.fraction - next) < 0.01 && prev!.url === presence.url;
  if (unchanged) return;
  await repo.saveProgress(presence.userId, {
    titleId,
    providerId: presence.providerId,
    season: presence.season,
    episode: presence.episode,
    fraction: next,
    url: presence.url,
    updatedAt: new Date().toISOString(),
  });
  await shareProgress(repo, presence.userId, titleId);
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
