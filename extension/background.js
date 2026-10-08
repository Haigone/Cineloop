import { api, getSettings } from "./api.js";
import { browseId, hasNetflixAccess, watchId } from "./netflix.js";

/*
 * CineLoop background worker.
 *
 * While a Netflix /watch tab is open it sends a heartbeat to CineLoop once a
 * minute with that tab's URL and title, plus what is playing as the player
 * names it (show, season, episode), read by player-title.js. That is all it
 * reads: no cookies, no other page content, no other sites (the only host
 * permission it can hold is www.netflix.com, granted by the user from the popup).
 */

const HEARTBEAT = "heartbeat";
/** A paused player is silent; after this long without sound we stop reporting. */
const SILENT_LIMIT_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  enablePlayerTitle();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  enablePlayerTitle();
});
chrome.permissions.onAdded.addListener(() => enablePlayerTitle());

const PLAYER_SCRIPT = "player-title";
const PAGE_SCRIPTS = ["player-title.js", "party-sync.js"];

/**
 * Once the user has granted netflix.com, have player-title.js run on its
 * pages (and in tabs already open), so the show and episode are recognised
 * without asking.
 */
async function enablePlayerTitle() {
  if (!(await hasNetflixAccess())) return;
  // Re-register every time, so an update that adds a script takes effect.
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [PLAYER_SCRIPT] });
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [PLAYER_SCRIPT] });
  await chrome.scripting.registerContentScripts([
    { id: PLAYER_SCRIPT, matches: ["https://www.netflix.com/*"], js: PAGE_SCRIPTS, runAt: "document_idle", persistAcrossSessions: true },
  ]);
  for (const tab of await chrome.tabs.query({ url: "https://www.netflix.com/*" })) {
    if (tab.id) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: PAGE_SCRIPTS }).catch(() => {});
  }
}
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === HEARTBEAT && tick());

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.title || "audible" in change) {
    remember(tab);
    if (change.url || change.title) tick();
  }
});
chrome.tabs.onRemoved.addListener(() => tick());
chrome.storage.onChanged.addListener((changes) => {
  if (changes.paused || changes.token) tick();
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "tick") {
    tick().then(reply, () => reply(null));
    return true;
  }
  if (message?.type === "player-title" && sender.tab?.id) {
    playerTitle(sender.tab.id, message).then(() => reply(true), () => reply(false));
    return true;
  }
  if (message?.type === "party-report" && sender.tab?.id) {
    partyReport(message).then(reply, () => reply(null));
    return true;
  }
  if (message?.type === "current") {
    current().then(reply, () => reply(null));
    return true;
  }
  return false;
});

/**
 * Changes one tab's entry. Updates run one at a time, so the player's report
 * and a tab event arriving together cannot overwrite each other.
 */
let tabsQueue = Promise.resolve();
function updateTab(tabId, change) {
  const run = tabsQueue.then(async () => {
    const { tabs = {} } = await chrome.storage.session.get("tabs");
    const entry = tabs[tabId] ?? {};
    const result = change(entry);
    tabs[tabId] = entry;
    await chrome.storage.session.set({ tabs });
    return result;
  });
  tabsQueue = run.catch(() => {});
  return run;
}

/** Per tab: the last show id seen before playback, and when it last made sound. */
async function remember(tab) {
  if (!tab?.id || !tab.url) return;
  await updateTab(tab.id, (entry) => {
    // The show page the user came from; any other Netflix page means it no longer applies.
    if (!watchId(tab.url)) entry.parentId = browseId(tab.url);
    if (tab.audible || !entry.audibleAt) entry.audibleAt = Date.now();
  });
}

/** What the player says is on screen, kept per tab until the next episode. */
async function playerTitle(tabId, m) {
  if (typeof m.watchId !== "string" || typeof m.title !== "string") return;
  const season = Number.isInteger(m.season) ? m.season : null;
  const episode = Number.isInteger(m.episode) ? m.episode : null;
  const changed = await updateTab(tabId, (entry) => {
    const was = entry.player;
    entry.player = {
      watchId: m.watchId,
      title: m.title.slice(0, 200),
      season,
      episode,
      progress: typeof m.progress === "number" && m.progress >= 0 && m.progress <= 1 ? m.progress : null,
      at: Date.now(),
    };
    return was?.watchId !== m.watchId || was?.title !== m.title || was?.episode !== episode || was?.season !== season;
  });
  if (changed) await tick();
}

/** Hints for the server from the player, when they belong to the episode in the URL. */
function playerHints(player, url) {
  if (!player || player.watchId !== watchId(url)) return {};
  return {
    ...(player.title ? { title: player.title } : {}),
    ...(player.season !== null ? { season: player.season } : {}),
    ...(player.episode !== null ? { episode: player.episode } : {}),
    ...(player.progress !== null && player.progress !== undefined ? { progress: player.progress } : {}),
  };
}

/** Outside a room, ask the server at most this often whether one has started. */
const SOLO_CHECK_MS = 10_000;
let soloCheckedAt = 0;

/**
 * Forwards the player's report to the room (watch together) and returns the
 * room's state for the page to apply. Only while CineLoop is active and not paused.
 */
async function partyReport(m) {
  const { token, paused } = await getSettings();
  if (!token || paused || typeof m.externalId !== "string" || typeof m.position !== "number" || typeof m.paused !== "boolean") return null;
  const { party: known = null } = await chrome.storage.session.get("party");
  if (!known && !m.action && Date.now() - soloCheckedAt < SOLO_CHECK_MS) return null;
  soloCheckedAt = Date.now();
  const body = { externalId: m.externalId, position: Math.max(0, m.position), paused: m.paused, ...(m.action === "play" || m.action === "pause" ? { action: m.action } : {}) };
  const { party } = await api("/api/extension/party", { method: "POST", body }).catch(() => ({ party: null }));
  await chrome.storage.session.set({ party: party ?? null });
  return { party };
}

/** Returned by current() when the playback tab has been silent too long (paused and left). */
const SILENT = { tab: { url: "" }, parentId: null };

async function netflixOpen() {
  return (await chrome.tabs.query({ url: "https://www.netflix.com/*" })).length > 0;
}

/** The Netflix playback tab to report, preferring the focused one. */
async function current() {
  if (!(await hasNetflixAccess())) return null;
  const tabs = await chrome.tabs.query({ url: "https://www.netflix.com/watch/*" });
  if (tabs.length === 0) return null;
  const { tabs: seen = {} } = await chrome.storage.session.get("tabs");
  const tab = tabs.find((t) => t.active) ?? tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  const info = seen[tab.id] ?? {};
  if (!tab.audible && info.audibleAt && Date.now() - info.audibleAt > SILENT_LIMIT_MS) return SILENT;
  return { tab, parentId: info.parentId ?? null, player: info.player ?? null };
}

let running = null;

/** Sends one heartbeat, or ends the session when nothing is playing. */
async function tick() {
  // Coalesce bursts of tab events into one request.
  running ??= (async () => {
    try {
      const { token, paused } = await getSettings();
      if (!token) {
        await setLive(false);
        return null;
      }
      const found = paused ? null : await current();
      const { live = false } = await chrome.storage.session.get("live");

      if (!found || !watchId(found.tab.url)) {
        // Back on Netflix's catalogue between episodes: a short break keeps the
        // session (and any friends with you); the server lets it lapse after a
        // few minutes without heartbeats.
        if (!paused && found !== SILENT && (await netflixOpen())) {
          await chrome.action.setBadgeText({ text: "" });
          return null;
        }
        if (live) await api("/api/extension/presence", { method: "DELETE" }).catch(() => {});
        await chrome.storage.session.set({ party: null });
        await setLive(false);
        return null;
      }

      await remember(found.tab);
      const hints = { ...playerHints(found.player, found.tab.url), ...(found.parentId ? { parentId: found.parentId } : {}) };
      const status = await api("/api/extension/observe", {
        method: "POST",
        body: {
          providerId: "netflix",
          url: found.tab.url,
          documentTitle: found.tab.title ?? "",
          ...(Object.keys(hints).length ? { hints } : {}),
          observedAt: new Date().toISOString(),
        },
      });
      await setLive(Boolean(status.watching), status);
      return status;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function setLive(live, status = null) {
  await chrome.storage.session.set({ live, status });
  const needsTitle = live && status?.watching && !status.watching.title;
  await chrome.action.setBadgeText({ text: live ? (needsTitle ? "?" : "●") : "" });
  await chrome.action.setBadgeBackgroundColor({ color: needsTitle ? "#7c6cf0" : "#d4294a" });
  await chrome.action.setTitle({
    title: !live ? "CineLoop" : needsTitle ? "CineLoop: dimmi cosa stai guardando" : `CineLoop: stai guardando ${status.watching.title.title}`,
  });
}
