import "./compat.js";
import { api, ApiError, getSettings, normalizeServer, request } from "./api.js";
import { hasNetflixAccess, NETFLIX_ORIGIN } from "./netflix.js";
import { DIRECTORY_ORIGINS, SC_VIXCLOUD_ORIGINS, getResolved, hasDirectoryAccess, hasStreamingAccess } from "./sc.js";
import { ANIMEUNITY_ACCESS_ORIGINS, hasAnimeAccess } from "./au.js";
import { hasPrimeAccess, PRIME_ORIGINS } from "./prime.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_SERVER = "https://cineloop-one.vercel.app";
/** True while the user is correcting a title that was recognised wrongly. */
let changing = false;
const show = (id, visible) => ($(id).hidden = !visible);

async function render() {
  const { server, token, paused, user } = await getSettings();
  $("who").textContent = user?.displayName ?? "";
  if (!token) {
    showOnly("pair");
    $("server").value = server || DEFAULT_SERVER;
    return;
  }
  const netflixOk = await hasNetflixAccess();
  const animeOk = await hasAnimeAccess();
  const streamingOk = await hasStreamingAccess();
  const primeOk = await hasPrimeAccess();
  if (!netflixOk && !primeOk && !animeOk && !streamingOk) {
    showOnly("grant");
    await renderGrant();
    return;
  }
  showOnly("main");
  await renderProviderPermissions();
  $("pause-btn").textContent = paused ? "Riprendi" : "Metti in pausa";

  // Ask the worker for a fresh heartbeat so the popup shows the live state.
  const status = paused ? null : await chrome.runtime.sendMessage({ type: "tick" }).catch(() => null);
  const w = status?.watching ?? null;
  show("paused-card", paused);
  show("idle", !paused && !w);
  const consent = status?.consent ?? null;
  show("consent", Boolean(consent));
  if (consent) {
    $("consent-text").textContent = `Prima di leggere ${consent === "animeunity" ? "AnimeUnity" : "StreamingCommunity"}, CineLoop ti chiede una conferma: la trovi sul sito, la prima volta.`;
  }
  show("watching", Boolean(w));
  show("confirm", Boolean(w && (!w.title || changing)));
  const statusNow = status ?? (await api("/api/extension/status").catch(() => null));
  await renderTogether(statusNow, w);
  if (!w) return;

  $("watching-title").textContent = w.title ? w.title.title : (w.label ?? "Titolo da confermare");
  $("confirm-help").textContent = w.label
    ? `Il player dice “${w.label}”, ma non l’ho trovato nel catalogo con questo nome. Sceglilo una volta: per le prossime puntate lo riconosco da solo.`
    : "Non riesco a leggerlo dal player. Sceglilo una volta: per le prossime puntate lo riconosco da solo.";
  const ep = w.season && w.episode ? `S${w.season}E${w.episode}` : "";
  const otherProvider = w.providerId === "streamingcommunity"
    ? "streamingcommunity"
    : w.providerId === "animeunity" ? "animeunity" : null;
  const providerLabel = otherProvider === "streamingcommunity"
    ? "su StreamingCommunity"
    : otherProvider === "animeunity"
      ? "su AnimeUnity"
      : w.providerId === "prime-video" ? "su Prime Video" : "su Netflix";
  $("watching-meta").textContent = [w.title?.year ? `Anno titolo: ${w.title.year}` : null, ep, providerLabel].filter(Boolean).join(" · ");
  show("sc-actions", otherProvider !== null);
  if (otherProvider === "streamingcommunity") {
    const origin = await chrome.runtime.sendMessage({ type: "sc-origin" }).catch(() => null);
    $("sc-search-hint").textContent = origin
      ? `Se il video non si apre diretto, cerca “${w.title ? w.title.title : (w.label ?? "")}” su ${new URL(origin).hostname}.`
      : "Dominio attuale non ancora risolto: usami dalla schermata di attivazione.";
  }
  $("player-read").textContent = await playerReading();
  renderSeasonAsk(w);
  show("change-btn", Boolean(w.title) && !changing);
  if (!w.title || changing) renderChoices($("suggestions"), status.suggestions);
  // The player named it but the catalog had no exact match: start the search from that name.
  if (!w.title && w.label && !$("q").value) {
    $("q").value = w.label;
    $("q").dispatchEvent(new Event("input"));
  }
}

/** A series episode without its season: ask once, later episodes follow on. */
function renderSeasonAsk(w) {
  const suffix = /(?:\s+|[:：]\s*)(?:season\s*)?(\d{1,2})\s*$/i.exec(w.label ?? "");
  const hintedSeason = suffix ? Number(suffix[1]) : null;
  const seasons = [...new Set([...(w.seasons ?? []), ...(hintedSeason ? [hintedSeason] : [])])].sort((a, b) => a - b);
  const ask = Boolean(w.title && w.episode && !w.season && (seasons.length > 1 || hintedSeason));
  show("season-ask", ask);
  if (!ask) return;
  $("season-ask-help").textContent = hintedSeason && !w.seasons?.includes(hintedSeason)
    ? `Il nome del player suggerisce la stagione ${hintedSeason}, ma il catalogo non la conferma. È quella che stai guardando?`
    : "Il player non indica chiaramente la stagione: quale stai guardando?";
  $("season-choices").replaceChildren(
    ...seasons.map((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `S${n}`;
      b.setAttribute("aria-label", `Stagione ${n}`);
      b.addEventListener("click", async () => {
        b.disabled = true;
        await api("/api/extension/season", { method: "POST", body: { season: n } }).catch(() => null);
        await render();
      });
      return b;
    }),
  );
}

/** What the Netflix player last showed, so the user can see what CineLoop reads. */
async function playerReading() {
  const { tabs = {} } = await chrome.storage.session.get("tabs");
  const player = Object.values(tabs)
    .map((t) => t.player)
    .filter(Boolean)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  if (!player || (!player.title && player.episode === null && player.progress === null)) {
    return "Il player non mi ha ancora mostrato nulla: muovi il mouse sul video per un attimo.";
  }
  const ep =
    player.episode === null ? "episodio non indicato" : player.season !== null ? `S${player.season}E${player.episode}` : `stagione non indicata (E${player.episode})`;
  const seen = player.progress !== null ? `${Math.round(player.progress * 100)}% visto` : "";
  return ["Letto dal player:", [player.title || "titolo non indicato", ep, seen].filter(Boolean).join(" · ")].join(" ");
}

/** "Guarda insieme": visibility, who is in the room, and whether you are in step. */
async function renderTogether(status, w) {
  const visible = status?.visible ?? true;
  $("visible").checked = visible;
  $("visible-help").textContent = visible
    ? "Mentre guardi, gli amici ti vedono in diretta su CineLoop con il pulsante “Guarda insieme”."
    : "Gli amici non ti vedono in diretta e non possono unirsi. La tua libreria si aggiorna lo stesso.";

  const { party = null } = await chrome.storage.session.get("party");
  const company = w ? [...w.with, ...w.guests] : [];
  const members = party?.members ?? company;
  const inRoom = Boolean(w) && (members.length > 0 || Boolean(party));
  show("room", inRoom);
  show("no-room", Boolean(w) && !inRoom && visible);
  show("together-dot", inRoom);
  if (document.activeElement !== $("party-url")) $("party-url").value = w?.partyUrl ?? "";
  if (!inRoom) return;

  $("room-title").textContent = party && !party.isHost ? `Guardi con ${party.hostName}` : "Guardate insieme";
  $("room-members").textContent = `Con te: ${members.join(", ")}`;
  const lastAction = { play: "play", pause: "pausa", seek: "salto" }[party?.lastAction] ?? (party?.paused ? "pausa" : "play");
  $("room-state").textContent = !party
    ? "Apri lo stesso episodio: posizione, play e pausa si allineano appena parte il video. Su AnimeUnity serve aver autorizzato anche il dominio del player."
    : !party.sameEpisode
      ? `Sei su un altro episodio rispetto a ${party.hostName}: posizione, play e pausa non vengono sincronizzati.`
      : party.seq > 0
        ? `Posizione, play e pausa sincronizzati. Ultimo: ${lastAction} di ${party.byYou ? "te" : party.byName}.`
        : "Posizione, play e pausa sincronizzati.";
  $("room-offsets").replaceChildren(
    ...(party?.offsets ?? []).map((o) => {
      const li = document.createElement("li");
      const s = Math.abs(o.seconds);
      const amount = s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`;
      li.textContent = `${o.name} è ${amount} ${o.seconds > 0 ? "avanti" : "indietro"}: CineLoop vi riallinea in pochi secondi. Se resta così, usa ← o → nel player di Netflix.`;
      return li;
    }),
  );
}

const TABS = ["tab-now", "tab-together", "tab-import"];

function selectTab(which) {
  if (!TABS.includes(which)) return;
  for (const tab of TABS) {
    const on = tab === which;
    $(tab).setAttribute("aria-selected", String(on));
    $(tab).tabIndex = on ? 0 : -1;
    $(tab.replace("tab-", "panel-")).hidden = !on;
  }
  chrome.storage.session.set({ popupTab: which }).catch(() => {});
  if (which === "tab-import") renderImport().catch(() => {});
}

for (const id of TABS) $(id).addEventListener("click", () => selectTab(id));
$("tab-now").parentElement.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const at = TABS.indexOf(document.activeElement?.id ?? "tab-now");
  const next = TABS[(at + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
  selectTab(next);
  $(next).focus();
});
chrome.storage.session.get("popupTab").then(({ popupTab }) => popupTab && selectTab(popupTab));

$("visible").addEventListener("change", async () => {
  const visible = $("visible").checked;
  try {
    await api("/api/extension/visibility", { method: "PATCH", body: { visible } });
  } catch {
    $("visible").checked = !visible;
  }
  await render();
});


/**
 * What the site permissions were at the last render. Firefox shows a permission
 * prompt only if it is requested straight from the click, before any await,
 * so the click handler decides from this.
 */
let perms = { netflix: false, prime: false, anime: false, directory: false, streaming: false, resolved: null };

/** Provider permissions remain manageable after the first site is enabled. */
async function renderProviderPermissions() {
  const netflix = await hasNetflixAccess();
  const prime = await hasPrimeAccess();
  const anime = await hasAnimeAccess();
  const directory = await hasDirectoryAccess();
  const streaming = await hasStreamingAccess();
  const resolved = await getResolved();
  perms = { netflix, prime, anime, directory, streaming, resolved };
  const sc = directory || streaming;
  const setButton = (id, active, label) => {
    $(id).textContent = active ? `Disabilita ${label} ✓` : `Attiva ${label}`;
    $(id).setAttribute("aria-pressed", String(active));
  };
  // Netflix is granted at install time and cannot be switched off from here (only paused).
  $("manage-netflix").textContent = netflix ? "Attivo ✓" : "Attiva Netflix";
  $("manage-netflix").disabled = netflix;
  $("manage-prime").textContent = prime ? "Attivo ✓" : "Attiva Prime Video";
  $("manage-prime").disabled = prime;
  // Like Netflix, AnimeUnity and the StreamingCommunity directory are granted at install and
  // switched on or off from CineLoop's own settings; only a revoked grant can be asked again.
  $("manage-au").textContent = anime ? "Attivo ✓" : "Attiva AnimeUnity";
  $("manage-au").disabled = anime;
  $("manage-sc").textContent = streaming ? "Attivo ✓" : "Attiva StreamingCommunity";
  $("manage-sc").disabled = streaming;
  $("manage-sc-status").textContent = sc
    ? (streaming ? `Attivo su ${resolved?.origin ? new URL(resolved.origin).hostname : "StreamingCommunity"}.` : "Directory attiva; il dominio di riproduzione va ancora autorizzato.")
    : "Disattivato. Puoi attivarlo quando vuoi.";
}

async function togglePermission(provider) {
  if (provider === "netflix") {
    // Only when it was revoked from the browser's settings (Firefox allows that).
    if (!perms.netflix) await chrome.permissions.request({ origins: [NETFLIX_ORIGIN] });
  } else if (provider === "prime-video") {
    // Come Netflix: concesso all'installazione, si richiede solo se revocato.
    if (!perms.prime) await chrome.permissions.request({ origins: PRIME_ORIGINS });
  } else if (provider === "animeunity") {
    const bundleGranted = await chrome.permissions.contains({ origins: ANIMEUNITY_ACCESS_ORIGINS });
    if (!bundleGranted) await chrome.permissions.request({ origins: ANIMEUNITY_ACCESS_ORIGINS });
  } else {
    const { resolved, directory, streaming } = perms;
    if (streaming) {
      // Already active; it is switched off from CineLoop's settings.
    } else if (resolved?.origin) {
      // A changed origin is detected from the watch tab. Chrome requires an
      // explicit user gesture to grant this new host before reading the player.
      await chrome.permissions.request({ origins: [`${resolved.origin}/*`, ...SC_VIXCLOUD_ORIGINS] });
    } else if (directory) {
      const origin = await chrome.runtime.sendMessage({ type: "resolve-sc", force: true }).catch(() => null);
      if (origin) await chrome.permissions.request({ origins: [`${origin}/*`, ...SC_VIXCLOUD_ORIGINS] });
    } else {
      await chrome.permissions.request({ origins: DIRECTORY_ORIGINS });
    }
  }
  await render();
}

for (const [id, provider] of [["manage-netflix", "netflix"], ["manage-prime", "prime-video"], ["manage-au", "animeunity"], ["manage-sc", "streamingcommunity"]]) {
  $(id).addEventListener("click", () => togglePermission(provider).catch(() => render()));
}

function showOnly(id) {
  for (const s of ["pair", "grant", "main"]) show(s, s === id);
}

/**
 * Il pulsante StreamingCommunity della schermata di attivazione cambia passo:
 * prima chiede il permesso per la directory (streaming-community.how), poi per
 * il dominio attuale trovato sul suo pulsante "StreamingCommunity", poi permette
 * di forzare una nuova risoluzione.
 */
async function renderGrant() {
  const auBtn = $("au-grant-btn");
  auBtn.hidden = false;
  const animeEnabled = await hasAnimeAccess();
  const animeBundleEnabled = await chrome.permissions.contains({ origins: ANIMEUNITY_ACCESS_ORIGINS });
  if (animeBundleEnabled) {
    auBtn.textContent = "AnimeUnity e VixCloud attivi ✓";
    auBtn.disabled = true;
  } else {
    auBtn.textContent = animeEnabled ? "Abilita anche il player VixCloud" : "Consenti AnimeUnity e VixCloud";
    auBtn.disabled = false;
    auBtn.onclick = async () => {
      if (await chrome.permissions.request({ origins: ANIMEUNITY_ACCESS_ORIGINS })) await renderGrant();
    };
  }
  const btn = $("sc-grant-btn");
  btn.hidden = false;
  const resolved = await getResolved();
  if (resolved?.origin && !(await hasStreamingAccess())) {
    $("sc-grant-status").textContent = "Ho rilevato il dominio dalla scheda che hai aperto. Consentilo una volta per leggere titolo, episodio e avanzamento.";
    btn.textContent = `Consenti su ${new URL(resolved.origin).hostname}`;
    btn.onclick = async () => {
      if (await chrome.permissions.request({ origins: [`${resolved.origin}/*`, ...SC_VIXCLOUD_ORIGINS] })) await render();
    };
    return;
  }
  if (!(await hasDirectoryAccess())) {
    $("sc-grant-status").textContent =
      "Per aggiornare il dominio dalla directory streaming-community.how, consenti l'accesso alla directory.";
    btn.textContent = "Consenti su streaming-community.how";
    btn.onclick = async () => {
      if (await chrome.permissions.request({ origins: DIRECTORY_ORIGINS })) await renderGrant();
    };
    return;
  }
  btn.textContent = "Trova il link attuale di StreamingCommunity";
  btn.onclick = async () => {
    btn.disabled = true;
    $("sc-grant-status").textContent = "Cerco il dominio attuale…";
    const origin = await chrome.runtime.sendMessage({ type: "resolve-sc", force: true }).catch(() => null);
    btn.disabled = false;
    if (origin) await render();
    else $("sc-grant-status").textContent = "Non trovo il pulsante StreamingCommunity: riprova tra poco.";
  };
}

function renderChoices(list, titles) {
  list.replaceChildren(
    ...titles.map((t) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.append(t.title);
      const year = document.createElement("span");
      year.className = "year";
      year.textContent = String(t.year);
      b.append(year);
      b.addEventListener("click", () => confirm(t.id, b));
      li.append(b);
      return li;
    }),
  );
}

async function confirm(titleId, button) {
  button.disabled = true;
  try {
    const current = await chrome.runtime.sendMessage({ type: "current" });
    await api("/api/extension/confirm", { method: "POST", body: { titleId, parentId: current?.parentId ?? null } });
    $("q").value = "";
    $("results").replaceChildren();
    changing = false;
    await render();
  } catch {
    button.disabled = false;
  }
}

let searchTimer;
$("q").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("q").value.trim();
  if (q.length < 2) return $("results").replaceChildren();
  searchTimer = setTimeout(async () => {
    const { titles } = await api(`/api/extension/search?q=${encodeURIComponent(q)}`).catch(() => ({ titles: [] }));
    if ($("q").value.trim() === q) renderChoices($("results"), titles);
  }, 300);
});

$("pair-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("pair-error");
  error.hidden = true;
  const server = normalizeServer($("server").value);
  if (!server) {
    error.textContent = "Indirizzo non valido. Usa quello che vedi nella barra del browser quando apri CineLoop.";
    error.hidden = false;
    return;
  }
  const submit = e.submitter;
  submit.disabled = true;
  try {
    const label = deviceLabel();
    const res = await request(server, "/api/extension/pair", { method: "POST", body: { code: $("code").value, label } });
    await chrome.storage.local.set({ server, token: res.token, user: res.user, paused: false });
    $("code").value = "";
    await render();
  } catch (err) {
    error.textContent =
      err instanceof ApiError && err.code === "invalid_code"
        ? "Codice non valido o scaduto. Generane uno nuovo nelle impostazioni."
        : err instanceof ApiError && err.status === 429
          ? "Troppi tentativi. Riprova tra un minuto."
          : "Non riesco a raggiungere CineLoop a questo indirizzo.";
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

/** "Google Chrome su Windows", "Firefox su macOS"… for the list in Impostazioni. */
function deviceLabel() {
  const ua = navigator.userAgent;
  const firefox = /Firefox\//.test(ua);
  const brand = firefox ? "Firefox" : navigator.userAgentData?.brands?.find((b) => !/Not.A.Brand|Chromium/i.test(b.brand))?.brand ?? "Browser";
  const platform =
    navigator.userAgentData?.platform ||
    (/Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "computer");
  return `${brand} su ${platform}`;
}

$("change-btn").addEventListener("click", async () => {
  changing = true;
  await render();
  $("q").focus();
});

$("grant-btn").addEventListener("click", async () => {
  // Must run inside the click: browsers only show the prompt for a user gesture.
  if (await chrome.permissions.request({ origins: [NETFLIX_ORIGIN] })) await render();
});

$("party-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("party-url").value.trim();
  $("party-error").hidden = true;
  try {
    await api("/api/extension/presence", { method: "PATCH", body: { partyUrl: value || null } });
    $("party-url").blur();
    await render();
  } catch {
    $("party-error").textContent = "Serve un link https valido.";
    $("party-error").hidden = false;
  }
});

$("pause-btn").addEventListener("click", async () => {
  const { paused } = await getSettings();
  await chrome.storage.local.set({ paused: !paused });
  await render();
});

$("open-btn").addEventListener("click", async () => {
  const { server } = await getSettings();
  if (server) chrome.tabs.create({ url: `${server}/home` });
});

$("consent-open").addEventListener("click", () => $("open-btn").click());

$("unpair-btn").addEventListener("click", async () => {
  await api("/api/extension/presence", { method: "DELETE" }).catch(() => {});
  await chrome.storage.local.remove(["token", "user"]);
  await render();
});

$("grant-skip").addEventListener("click", () => render());

$("manual-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const num = (id) => {
    const v = $(id).value.trim();
    return v === "" ? null : Math.round(Number(v));
  };
  const ok = await chrome.runtime
    .sendMessage({ type: "manual-progress", season: num("manual-season"), episode: num("manual-episode"), progress: num("manual-progress") })
    .catch(() => false);
  show("manual-ok", Boolean(ok));
  if (ok) await render();
});

// Import "La mia lista" from Netflix -----------------------------------------

const MY_LIST = "https://www.netflix.com/browse/my-list";

/** A Netflix tab showing "La mia lista": the one in front, else any open one. */
async function myListTab() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.url?.startsWith(MY_LIST)) return active;
  const open = await chrome.tabs.query({ url: `${MY_LIST}*` }).catch(() => []);
  return open.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

/**
 * Runs in the "La mia lista" page the user has open: reads the name and id of each card.
 * With `scroll`, it scrolls the page to the bottom as the user would, so Netflix loads every
 * card, collecting them on the way, then goes back to the top. No requests to Netflix.
 */
async function readMyList(scroll) {
  const out = new Map();
  const idOf = (el) => {
    const href = /\/(?:watch|title)\/(\d+)/.exec(el.getAttribute("href") || "");
    if (href) return href[1];
    // Cards in the grid carry their id in Netflix's tracking context, URL-encoded JSON.
    const ctx = el.getAttribute("data-ui-tracking-context") || "";
    let text = ctx;
    try {
      text = decodeURIComponent(ctx);
    } catch {}
    return /"video_id"\s*:\s*(\d+)/.exec(text)?.[1] ?? null;
  };
  const nameOf = (el) =>
    (
      el.getAttribute("aria-label") ||
      el.querySelector("[aria-label]")?.getAttribute("aria-label") ||
      el.querySelector("img[alt]")?.getAttribute("alt") ||
      el.querySelector(".fallback-text")?.textContent ||
      ""
    ).trim();
  const collect = () => {
    for (const el of document.querySelectorAll('a[href*="/watch/"], a[href*="/title/"], [data-ui-tracking-context]')) {
      const id = idOf(el);
      if (!id || out.has(id)) continue;
      const name = nameOf(el);
      if (name) out.set(id, name);
    }
  };
  collect();
  if (scroll) {
    const page = document.scrollingElement || document.documentElement;
    const started = Date.now();
    for (let still = 0; still < 4 && Date.now() - started < 120_000; ) {
      const [size, height] = [out.size, page.scrollHeight];
      window.scrollBy(0, Math.max(400, window.innerHeight * 0.9));
      await new Promise((r) => setTimeout(r, 700));
      collect();
      const atEnd = window.scrollY + window.innerHeight >= page.scrollHeight - 4;
      still = atEnd && out.size === size && page.scrollHeight === height ? still + 1 : 0;
    }
    window.scrollTo(0, 0);
  }
  return [...out].map(([id, title]) => ({ id, title }));
}

async function renderImport() {
  if (!(await hasNetflixAccess())) {
    $("import-help").textContent = "Attiva Netflix in “Servizi collegati” per importare la tua lista.";
    for (const id of ["import-open", "import-scroll", "import-btn"]) show(id, false);
    return;
  }
  const tab = await myListTab();
  show("import-open", !tab);
  show("import-scroll", Boolean(tab));
  show("import-btn", Boolean(tab));
  if (!tab) {
    $("import-help").textContent =
      "Apri La mia lista su Netflix, poi riapri questo pannello: i titoli finiscono nella tua wishlist di CineLoop, senza doppioni.";
    return;
  }
  await readTab(tab, false);
  $("import-scroll").onclick = async () => {
    $("import-scroll").disabled = true;
    $("import-help").textContent = "Scorro La mia lista fino in fondo… tieni aperto questo pannello.";
    await readTab(tab, true);
    $("import-scroll").disabled = false;
  };
}

/** Reads the titles from the tab and shows how many; `scroll` reads the whole list. */
async function readTab(tab, scroll) {
  let items = [];
  let failed = false;
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readMyList, args: [scroll] });
    items = Array.isArray(result) ? result : [];
  } catch {
    failed = true;
  }
  $("import-help").textContent = failed
    ? "Non riesco a leggere la scheda di Netflix: ricaricala (F5) e riapri questo pannello."
    : items.length
      ? `Vedo ${items.length} titoli.${scroll ? "" : " Se la lista è più lunga, premi “Scorri e leggi tutta la lista”."}`
      : "Non vedo titoli nella pagina: aspetta che le copertine si carichino, poi premi “Scorri e leggi tutta la lista”.";
  $("import-btn").textContent = items.length === 1 ? "Importa 1 titolo" : `Importa ${items.length} titoli`;
  $("import-btn").disabled = items.length === 0;
  $("import-btn").onclick = () => importItems(items);
}

/** Sends the list in small batches and reports what was added. */
async function importItems(items) {
  const btn = $("import-btn");
  btn.disabled = true;
  show("import-status", true);
  show("import-missing", false);
  const total = { added: 0, already: 0, notFound: [] };
  try {
    const queue = [...items];
    while (queue.length > 0) {
      $("import-status").textContent = `Importo… ${items.length - queue.length} di ${items.length}`;
      const res = await api("/api/extension/import-list", { method: "POST", body: { items: queue.splice(0, 10), partial: true } });
      // What the server had no time for comes back: it goes first in the next batch.
      if (Array.isArray(res.pending)) queue.unshift(...res.pending);
      total.added += res.added.length;
      total.already += res.already;
      total.notFound.push(...res.notFound);
    }
    $("import-status").textContent = [
      `Aggiunti alla wishlist: ${total.added}.`,
      total.already ? `Già su CineLoop: ${total.already}.` : "",
      total.notFound.length ? `Non trovati nel catalogo: ${total.notFound.length}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    $("import-missing").replaceChildren(
      ...total.notFound.map((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        return li;
      }),
    );
    show("import-missing", total.notFound.length > 0);
    await render();
  } catch (err) {
    $("import-status").textContent =
      err instanceof ApiError && err.status === 429
        ? "Troppe richieste in poco tempo: riprova tra un minuto. I titoli già importati non si duplicano."
        : "Importazione interrotta: CineLoop non risponde. Riprova, i titoli già importati non si duplicano.";
  } finally {
    btn.disabled = false;
  }
}

$("import-open").addEventListener("click", () => chrome.tabs.create({ url: MY_LIST }));
// A file picker would close the popup, so the upload happens in a tab of the extension.
$("history-upload").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("import.html?mode=history") }));

render();
