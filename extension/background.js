import "./compat.js";
import { api, getSettings } from "./api.js";
import { browseId, hasNetflixAccess, watchId } from "./netflix.js";
import { getResolved, hasDirectoryAccess, hasStreamingAccess, isStreamingUrl, rememberObservedStreamingUrl, resolveStreamingUrl, scWatchId } from "./sc.js";
import { auWatchId, hasAnimeAccess, isAnimeUrl } from "./au.js";
import { hasPrimeAccess, isPrimeUrl, PRIME_ORIGINS } from "./prime.js";

/*
 * CineLoop background worker.
 *
 * Mentre e' aperta una scheda di riproduzione di Netflix, Prime Video o
 * StreamingCommunity, manda un heartbeat a CineLoop una volta al minuto con
 * l'URL e il titolo di quella scheda, piu' cio' che sta riproducendo il
 * player (serie, stagione, episodio), letto da player-title.js, prime-page.js
 * o sc-page.js.
 * Legge solo questo: niente cookie, niente altro contenuto delle pagine,
 * nessun altro sito. StreamingCommunity cambia dominio di continuo: il link
 * aggiornato viene letto dal pulsante "StreamingCommunity" di
 * https://www.streaming-community.how/ (sc.js), dopo che l'utente ha
 * concesso quei siti dal popup.
 */

const HEARTBEAT = "heartbeat";
/** Un player in pausa e' silenzioso; dopo cosi' tempo senza audio smette di segnalare. */
const SILENT_LIMIT_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  enablePlayerTitle();
  enablePrimeTabs();
  enableAnimePage();
  enableScPage();
  rememberOpenTabs();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(HEARTBEAT, { periodInMinutes: 1 });
  enablePlayerTitle();
  enableAnimePage();
  enableScPage();
  rememberOpenTabs();
});
chrome.permissions.onAdded.addListener(() => {
  enablePlayerTitle();
  enableAnimePage();
  enableScPage();
});
chrome.permissions.onRemoved.addListener(() => {
  disableUnauthorizedScripts();
});

/** Detect a valid SC watch tab already open when the extension starts. */
async function rememberOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => remember(tab).catch(() => {})));
}

async function disableUnauthorizedScripts() {
  const removals = [];
  if (!(await hasNetflixAccess())) removals.push("player-title", NETFLIX_PLAYER_SCRIPT);
  if (!(await hasAnimeAccess())) removals.push("au-page");
  if (!(await hasStreamingAccess())) removals.push("sc-page");
  if (removals.length) {
    await chrome.scripting.unregisterContentScripts({ ids: removals }).catch(() => {});
  }
}

const PLAYER_SCRIPT = "player-title";
const SC_SCRIPT = "sc-page";
const AU_SCRIPT = "au-page";
const PAGE_SCRIPTS = ["compat.js", "player-title.js", "party-sync.js"];
/** Runs in the page itself, where Netflix's player lives: seeks for watching together. */
const NETFLIX_PLAYER_SCRIPT = "netflix-player";

/**
 * Una volta concesso netflix.com, fa girare player-title.js sulle sue pagine
 * (anche nelle schede gia' aperte), cosi' serie ed episodio vengono riconosciuti.
 */
async function enablePlayerTitle() {
  if (!(await hasNetflixAccess())) return;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [PLAYER_SCRIPT] });
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [PLAYER_SCRIPT] });
  await chrome.scripting.registerContentScripts([
    { id: PLAYER_SCRIPT, matches: ["https://www.netflix.com/*"], js: PAGE_SCRIPTS, runAt: "document_idle", persistAcrossSessions: true },
  ]);
  const main = await chrome.scripting.getRegisteredContentScripts({ ids: [NETFLIX_PLAYER_SCRIPT] });
  if (main.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [NETFLIX_PLAYER_SCRIPT] });
  await chrome.scripting
    .registerContentScripts([
      { id: NETFLIX_PLAYER_SCRIPT, matches: ["https://www.netflix.com/*"], js: ["netflix-player.js"], world: "MAIN", runAt: "document_idle", persistAcrossSessions: true },
    ])
    .catch(() => {});
  for (const tab of await chrome.tabs.query({ url: "https://www.netflix.com/*" })) {
    if (!tab.id) continue;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: PAGE_SCRIPTS }).catch(() => {});
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["netflix-player.js"], world: "MAIN" }).catch(() => {});
  }
}

/**
 * prime-page.js e' dichiarato nel manifest e parte da solo sulle pagine nuove;
 * le schede di Prime Video gia' aperte quando l'estensione viene installata o
 * aggiornata lo ricevono qui.
 */
async function enablePrimeTabs() {
  if (!(await hasPrimeAccess())) return;
  for (const tab of await chrome.tabs.query({ url: PRIME_ORIGINS })) {
    if (tab.id) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["compat.js", "prime-page.js", "party-sync.js"] }).catch(() => {});
  }
}

/**
 * Sul dominio StreamingCommunity risolto fa girare sc-page.js, che legge
 * serie, stagione, episodio e avanzamento del video.
 */
async function enableScPage() {
  const resolved = await getResolved();
  if (!resolved?.origin) return;
  if (!(await hasStreamingAccess())) return;
  const match = `${resolved.origin}/*`;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SC_SCRIPT] });
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [SC_SCRIPT] });
  await chrome.scripting.registerContentScripts([
    { id: SC_SCRIPT, matches: [match], js: ["compat.js", "sc-page.js"], runAt: "document_idle", persistAcrossSessions: true },
  ]);
  for (const tab of await chrome.tabs.query({ url: match })) {
    if (tab.id) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["compat.js", "sc-page.js"] }).catch(() => {});
  }
}

/** Su animeunity.so fa girare au-page.js: titolo, episodio e avanzamento del video. */
async function enableAnimePage() {
  if (!(await hasAnimeAccess())) return;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AU_SCRIPT] });
  if (registered.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [AU_SCRIPT] });
  await chrome.scripting.registerContentScripts([
    { id: AU_SCRIPT, matches: ["https://www.animeunity.so/*"], js: ["compat.js", "au-page.js"], runAt: "document_idle", persistAcrossSessions: true },
  ]);
  for (const tab of await chrome.tabs.query({ url: "https://www.animeunity.so/*" })) {
    if (tab.id) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["compat.js", "au-page.js"] }).catch(() => {});
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.scResolved) enableScPage();
  if (changes.paused || changes.token) tick();
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "tick") {
    tick().then(reply, () => reply(null));
    return true;
  }
  if (message?.type === "resolve-sc") {
    resolveStreamingUrl({ force: Boolean(message.force) }).then(reply, () => reply(null));
    return true;
  }
  if (message?.type === "sc-origin") {
    getResolved().then((r) => reply(r?.origin ?? null), () => reply(null));
    return true;
  }
  if (message?.type === "manual-progress") {
    manualProgress(message).then((ok) => reply(ok), () => reply(false));
    return true;
  }
  if (message?.type === "player-title" && sender.tab?.id) {
    playerTitle(sender.tab.id, message).then(() => reply(true), () => reply(false));
    return true;
  }
  if (message?.type === "prime-player" && sender.tab?.id) {
    primePlayer(sender.tab.id, message).then(() => reply(true), () => reply(false));
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
 * Cambia la voce di una scheda. Gli aggiornamenti avvengono uno alla volta,
 * cosi' il resoconto del player e un evento della scheda non si sovrascrivono.
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

/** Per scheda: l'ultimo id serie visto prima della riproduzione e l'ultimo audio. */
async function remember(tab) {
  if (!tab?.id || !tab.url) return;
  const onNetflix = Boolean(watchId(tab.url) || browseId(tab.url));
  const onAnime = isAnimeUrl(tab.url);
  const onPrime = isPrimeUrl(tab.url);
  // If the user opened a watch URL on a new SC hostname, remember that origin.
  // Content access still waits for the browser permission prompt.
  const observedOrigin = await rememberObservedStreamingUrl(tab.url);
  const onStreaming = Boolean(observedOrigin) || await isStreamingUrl(tab.url);
  if (!onNetflix && !onAnime && !onPrime && !onStreaming) return;
  await updateTab(tab.id, (entry) => {
    if (onNetflix && !watchId(tab.url)) entry.parentId = browseId(tab.url);
    if (tab.audible || !entry.audibleAt) entry.audibleAt = Date.now();
  });
}

/** Cio' che il player dice essere sullo schermo, per scheda, finche' non cambia episodio. */
async function playerTitle(tabId, m) {
  if (typeof m.watchId !== "string" || typeof m.title !== "string") return;
  const season = Number.isInteger(m.season) ? m.season : null;
  const episode = Number.isInteger(m.episode) ? m.episode : null;
  const episodeId = typeof m.episodeId === "string" && /^\d{1,12}$/.test(m.episodeId) ? m.episodeId : null;
  const changed = await updateTab(tabId, (entry) => {
    const was = entry.player;
    entry.player = {
      watchId: m.watchId,
      title: m.title.slice(0, 200),
      season,
      episode,
      episodeId,
      progress: typeof m.progress === "number" && m.progress >= 0 && m.progress <= 1 ? m.progress : null,
      at: Date.now(),
    };
    return was?.watchId !== m.watchId || was?.title !== m.title || was?.episode !== episode || was?.episodeId !== episodeId || was?.season !== season;
  });
  if (changed) await tick();
}

/**
 * Il player di Prime Video, aperto o chiuso, come lo vede prime-page.js. Il
 * player non ha un indirizzo suo: l'id e' quello della pagina del titolo
 * oppure, se manca, il nome letto nel player.
 */
async function primePlayer(tabId, m) {
  const open = m.open === true && typeof m.watchId === "string" && m.watchId.length <= 240 && typeof m.title === "string";
  const changed = await updateTab(tabId, (entry) => {
    const was = entry.prime ? entry.player : null;
    if (!open) {
      entry.prime = null;
      return Boolean(was);
    }
    const season = Number.isInteger(m.season) ? m.season : null;
    const episode = Number.isInteger(m.episode) ? m.episode : null;
    entry.prime = { at: Date.now() };
    entry.player = {
      watchId: m.watchId,
      title: m.title.slice(0, 200),
      season,
      episode,
      episodeId: null,
      progress: typeof m.progress === "number" && m.progress >= 0 && m.progress <= 1 ? m.progress : null,
      at: Date.now(),
    };
    // Il video che va conta come audio per la pausa lunga (vedi pickPlaying).
    if (m.playing === true) entry.audibleAt = Date.now();
    return !was || was.watchId !== m.watchId || was.title !== entry.player.title || was.season !== season || was.episode !== episode;
  });
  if (changed) await tick();
}

/** Aggiornamento manuale di stagione, episodio e posizione, dal popup. */
async function manualProgress(m) {
  const found = await current();
  if (!found || !found.tab?.id) return false;
  const season = Number.isInteger(m.season) ? m.season : null;
  const episode = Number.isInteger(m.episode) ? m.episode : null;
  const progress = typeof m.progress === "number" && m.progress >= 0 && m.progress <= 100 ? m.progress / 100 : null;
  if (season === null && episode === null && progress === null) return false;
  await updateTab(found.tab.id, (entry) => {
    const was = entry.player ?? { watchId: "", title: "" };
    entry.player = {
      ...was,
      ...(season !== null ? { season } : {}),
      ...(episode !== null ? { episode } : {}),
      ...(progress !== null ? { progress } : {}),
      at: Date.now(),
    };
  });
  await tick();
  return true;
}

/** Suggerimenti dal player, quando appartengono all'episodio dell'URL. */
function playerHints(player, id) {
  if (!player || player.watchId !== id) return {};
  return {
    ...(player.title ? { title: player.title } : {}),
    ...(player.season !== null ? { season: player.season } : {}),
    ...(player.episode !== null ? { episode: player.episode } : {}),
    ...(player.episodeId ? { episodeId: player.episodeId } : {}),
    ...(player.progress !== null && player.progress !== undefined ? { progress: player.progress } : {}),
  };
}

/** Fuori da una stanza, chiedi al server al massimo ogni tanto se ne e' partita una. */
const SOLO_CHECK_MS = 10_000;
let soloCheckedAt = 0;

/**
 * Inoltra il resoconto del player alla stanza (guarda insieme) e ne restituisce
 * lo stato, per la pagina. Solo mentre CineLoop e' attivo e non in pausa.
 */
async function partyReport(m) {
  const { token, paused } = await getSettings();
  if (!token || paused || typeof m.externalId !== "string" || typeof m.position !== "number" || typeof m.paused !== "boolean") return null;
  const { party: known = null } = await chrome.storage.session.get("party");
  if (!known && !m.action && Date.now() - soloCheckedAt < SOLO_CHECK_MS) return null;
  soloCheckedAt = Date.now();
  // Prime Video: the id names the whole show, the season and episode tell the episodes apart.
  const where = Object.fromEntries(["season", "episode"].filter((k) => Number.isInteger(m[k])).map((k) => [k, m[k]]));
  const body = { externalId: m.externalId, ...where, position: Math.max(0, m.position), paused: m.paused, ...(["play", "pause", "seek"].includes(m.action) ? { action: m.action } : {}), ...(typeof m.following === "boolean" ? { following: m.following } : {}) };
  const { party } = await api("/api/extension/party", { method: "POST", body }).catch(() => ({ party: null }));
  await chrome.storage.session.set({ party: party ?? null });
  return { party };
}

/** Restituito da current() quando la scheda di riproduzione e' ferma da troppo (pausa e abbandono). */
const SILENT = { tab: { url: "" }, parentId: null };

/** Il player di Prime Video si e' fatto sentire da poco (prime-page.js scrive ogni 20 secondi). */
const PRIME_FRESH_MS = 75_000;

async function primeTabs() {
  if (!(await hasPrimeAccess())) return [];
  return chrome.tabs.query({ url: PRIME_ORIGINS }).catch(() => []);
}

async function primeOpen() {
  return (await primeTabs()).length > 0;
}

/** La scheda di Prime Video con il player aperto, se c'e'. */
async function primeCurrent() {
  const { tabs: seen = {} } = await chrome.storage.session.get("tabs");
  const playing = (await primeTabs()).filter((t) => {
    const info = seen[t.id];
    return info?.prime && Date.now() - info.prime.at < PRIME_FRESH_MS && info.player?.watchId;
  });
  if (playing.length === 0) return null;
  const found = await pickPlaying(playing, () => null);
  if (found === SILENT) return SILENT;
  return { ...found, id: found.player.watchId };
}

async function netflixOpen() {
  return (await chrome.tabs.query({ url: "https://www.netflix.com/*" })).length > 0;
}

/** C'e' almeno una scheda aperta su AnimeUnity? */
async function animeOpen() {
  if (!(await hasAnimeAccess())) return false;
  return (await chrome.tabs.query({ url: "https://www.animeunity.so/*" })).length > 0;
}

/** C'e' almeno una scheda aperta sul dominio StreamingCommunity risolto? */
async function streamingOpen() {
  return (await streamingTabs()).length > 0;
}

async function streamingTabs() {
  if (!(await hasStreamingAccess())) return [];
  const resolved = await getResolved();
  if (!resolved?.origin) return [];
  try {
    return await chrome.tabs.query({ url: `${resolved.origin}/*` });
  } catch {
    return [];
  }
}

/** La scheda di riproduzione tra i provider attivi, preferendo quella attiva. */
async function current() {
  if (await hasAnimeAccess()) {
    const tabs = (await chrome.tabs.query({ url: "https://www.animeunity.so/*" })).filter((t) => auWatchId(t.url ?? ""));
    if (tabs.length > 0) return pickPlaying(tabs, auWatchId);
  }
  if (await hasNetflixAccess()) {
    const tabs = await chrome.tabs.query({ url: "https://www.netflix.com/watch/*" });
    if (tabs.length > 0) return pickPlaying(tabs, watchId);
  }
  const prime = await primeCurrent();
  if (prime) return prime;
  return streamingCurrent();
}

/** La scheda StreamingCommunity con la pagina di un titolo, se c'e'. */
async function streamingCurrent() {
  const tabs = (await streamingTabs()).filter((t) => scWatchId(t.url ?? ""));
  if (tabs.length === 0) return null;
  return pickPlaying(tabs, scWatchId);
}

/** Sceglie la scheda attiva (o la piu' recente) e verifica che non sia ferma da troppo. */
async function pickPlaying(tabs, idOf) {
  const { tabs: seen = {} } = await chrome.storage.session.get("tabs");
  const tab = tabs.find((t) => t.active) ?? tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  const info = seen[tab.id] ?? {};
  if (!tab.audible && info.audibleAt && Date.now() - info.audibleAt > SILENT_LIMIT_MS) return SILENT;
  return { tab, parentId: info.parentId ?? null, player: info.player ?? null, id: idOf(tab.url ?? "") };
}

let running = null;

/** Manda un heartbeat, oppure chiude la sessione quando non c'e' nulla in riproduzione. */
async function tick() {
  // Riduce a una richiesta i picchi di eventi delle schede.
  running ??= (async () => {
    try {
      // Tieni il dominio StreamingCommunity fresco (sc.js lo mette in cache per ore).
      if (await hasDirectoryAccess()) resolveStreamingUrl().catch(() => {});

      const { token, paused } = await getSettings();
      if (!token) {
        await setLive(false);
        return null;
      }
      const found = paused ? null : await current();
      const { live = false } = await chrome.storage.session.get("live");

      const id = found && found !== SILENT ? found.id ?? watchId(found.tab.url) : null;
      if (!found || !id) {
        // Di nuovo nel catalogo tra un episodio e l'altro: una pausa breve tiene
        // la sessione (e gli amici con te); il server la lascia scadere dopo
        // qualche minuto senza heartbeat.
        if (!paused && found !== SILENT && ((await netflixOpen()) || (await animeOpen()) || (await primeOpen()) || (await streamingOpen()))) {
          // La sessione CineLoop può restare valida durante la navigazione nel catalogo,
          // ma Discord deve sapere subito che il player non è più attivo.
          await sendDiscordPresence(null);
          await chrome.action.setBadgeText({ text: "" });
          return null;
        }
        if (live) await api("/api/extension/presence", { method: "DELETE" }).catch(() => {});
        await chrome.storage.session.set({ party: null });
        await setLive(false);
        return null;
      }

      await remember(found.tab);
      const providerId = /^https:\/\/www\.netflix\.com\//.test(found.tab.url)
        ? "netflix"
        : /^https:\/\/www\.animeunity\.so\//.test(found.tab.url)
          ? "animeunity"
          : isPrimeUrl(found.tab.url)
            ? "prime-video"
            : "streamingcommunity";
      const hints = { ...playerHints(found.player, id), ...(found.parentId ? { parentId: found.parentId } : {}) };
      const status = await api("/api/extension/observe", {
        method: "POST",
        body: {
          providerId,
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

async function sendDiscordPresence(watching) {
  const title = watching?.title;
  const posterUrl = title?.artwork?.posterUrl ?? title?.posterUrl ?? watching?.posterUrl ?? null;
  fetch("http://127.0.0.1:32145/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      watching: watching ? { ...watching, ...(posterUrl ? { posterUrl } : {}) } : null,
    }),
  }).catch(() => {});
}

async function setLive(live, status = null) {
  await chrome.storage.session.set({ live, status });
  // Optional local Discord bridge: title, episode and poster URL only.
  await sendDiscordPresence(live ? status?.watching ?? null : null);
  const needsTitle = live && status?.watching && !status.watching.title;
  await chrome.action.setBadgeText({ text: live ? (needsTitle ? "?" : "●") : "" });
  await chrome.action.setBadgeBackgroundColor({ color: needsTitle ? "#7c6cf0" : "#d4294a" });
  await chrome.action.setTitle({
    title: !live ? "CineLoop" : needsTitle ? "CineLoop: dimmi cosa stai guardando" : `CineLoop: stai guardando ${status.watching.title.title}`,
  });
}
