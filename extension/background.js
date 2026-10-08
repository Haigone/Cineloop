import { api, getSettings } from "./api.js";
import { browseId, hasNetflixAccess, watchId } from "./netflix.js";

/*
 * CineLoop background worker.
 *
 * While a Netflix /watch tab is open it sends a heartbeat to CineLoop once a
 * minute with that tab's URL and title. That is all it reads: no cookies, no
 * page content, no player, no other sites (the only host permission it can
 * hold is www.netflix.com, granted by the user from the popup).
 */

const HEARTBEAT = "heartbeat";
/** A paused player is silent; after this long without sound we stop reporting. */
const SILENT_LIMIT_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 }));
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

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === "tick") {
    tick().then(reply, () => reply(null));
    return true;
  }
  if (message?.type === "current") {
    current().then(reply, () => reply(null));
    return true;
  }
  return false;
});

/** Per tab: the last show id seen before playback, and when it last made sound. */
async function remember(tab) {
  if (!tab?.id || !tab.url) return;
  const { tabs = {} } = await chrome.storage.session.get("tabs");
  const entry = tabs[tab.id] ?? {};
  const show = browseId(tab.url);
  if (show) entry.parentId = show;
  if (tab.audible || !entry.audibleAt) entry.audibleAt = Date.now();
  tabs[tab.id] = entry;
  await chrome.storage.session.set({ tabs });
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
  return { tab, parentId: info.parentId ?? null };
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
        await setLive(false);
        return null;
      }

      await remember(found.tab);
      const status = await api("/api/extension/observe", {
        method: "POST",
        body: {
          providerId: "netflix",
          url: found.tab.url,
          documentTitle: found.tab.title ?? "",
          ...(found.parentId ? { hints: { parentId: found.parentId } } : {}),
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
