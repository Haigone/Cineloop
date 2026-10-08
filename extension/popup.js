import { api, ApiError, getSettings, normalizeServer, request } from "./api.js";
import { hasNetflixAccess, NETFLIX_ORIGIN } from "./netflix.js";

const $ = (id) => document.getElementById(id);
/** True while the user is correcting a title that was recognised wrongly. */
let changing = false;
const show = (id, visible) => ($(id).hidden = !visible);

async function render() {
  const { server, token, paused, user } = await getSettings();
  $("who").textContent = user?.displayName ?? "";
  if (!token) {
    showOnly("pair");
    if (server) $("server").value = server;
    return;
  }
  if (!(await hasNetflixAccess())) return showOnly("grant");
  showOnly("main");
  $("pause-btn").textContent = paused ? "Riprendi" : "Metti in pausa";

  // Ask the worker for a fresh heartbeat so the popup shows the live state.
  const status = paused ? null : await chrome.runtime.sendMessage({ type: "tick" }).catch(() => null);
  const w = status?.watching ?? null;
  show("paused-card", paused);
  show("idle", !paused && !w);
  show("watching", Boolean(w));
  show("confirm", Boolean(w && (!w.title || changing)));
  const statusNow = status ?? (await api("/api/extension/status").catch(() => null));
  renderList(statusNow?.list ?? []);
  await renderTogether(statusNow, w);
  if (!w) return;

  $("watching-title").textContent = w.title ? w.title.title : (w.label ?? "Titolo da confermare");
  $("confirm-help").textContent = w.label
    ? `Il player dice “${w.label}”, ma non l’ho trovato nel catalogo con questo nome. Sceglilo una volta: per le prossime puntate lo riconosco da solo.`
    : "Non riesco a leggerlo dal player. Sceglilo una volta: per le prossime puntate lo riconosco da solo.";
  const ep = w.episode ? (w.season ? `S${w.season} · E${w.episode}` : `Episodio ${w.episode}`) : "";
  $("watching-meta").textContent = [w.title?.year, ep, "su Netflix"].filter(Boolean).join(" · ");
  $("player-read").textContent = await playerReading();
  show("change-btn", Boolean(w.title) && !changing);
  if (!w.title || changing) renderChoices($("suggestions"), status.suggestions);
  // The player named it but the catalog had no exact match: start the search from that name.
  if (!w.title && w.label && !$("q").value) {
    $("q").value = w.label;
    $("q").dispatchEvent(new Event("input"));
  }
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
  const ep = player.episode !== null ? (player.season !== null ? `St. ${player.season} Ep. ${player.episode}` : `Ep. ${player.episode}`) : "episodio non indicato";
  const seen = player.progress !== null ? `${Math.round(player.progress * 100)}% visto` : "";
  return ["Letto dal player:", [player.title || "titolo non indicato", ep, seen].filter(Boolean).join(" · ")].join(" ");
}

/** In progress (with the episode) and wishlist; each opens a Netflix search for it. */
function renderList(items) {
  show("my-list", items.length > 0);
  const rows = [];
  let section = null;
  for (const item of items) {
    if (item.status !== section) {
      section = item.status;
      const h = document.createElement("li");
      h.className = "heading";
      h.textContent = section === "watching" ? "In corso" : "Wishlist";
      rows.push(h);
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://www.netflix.com/search?q=${encodeURIComponent(item.title)}`;
    a.target = "_blank";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = item.season && item.episode ? `S${item.season} · E${item.episode}` : String(item.year);
    a.append(name, meta);
    li.append(a);
    rows.push(li);
  }
  $("list-items").replaceChildren(...rows);
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
  $("room-state").textContent = !party
    ? "Apri lo stesso episodio: play e pausa si allineano appena parte il video."
    : !party.sameEpisode
      ? `Sei su un altro episodio rispetto a ${party.hostName}: play e pausa non vengono sincronizzati.`
      : party.seq > 0
        ? `Play e pausa sincronizzati. Ultimo: ${party.paused ? "pausa" : "play"} di ${party.byYou ? "te" : party.byName}.`
        : "Play e pausa sincronizzati.";
  $("room-offsets").replaceChildren(
    ...(party?.offsets ?? []).map((o) => {
      const li = document.createElement("li");
      const s = Math.abs(o.seconds);
      const amount = s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`;
      li.textContent = `${o.name} è ${amount} ${o.seconds > 0 ? "avanti" : "indietro"}: usa ← o → nel player di Netflix per allinearti.`;
      return li;
    }),
  );
}

function selectTab(which) {
  for (const [tab, panel] of [["tab-now", "panel-now"], ["tab-together", "panel-together"]]) {
    const on = tab === which;
    $(tab).setAttribute("aria-selected", String(on));
    $(tab).tabIndex = on ? 0 : -1;
    $(panel).hidden = !on;
  }
  chrome.storage.session.set({ popupTab: which }).catch(() => {});
}

for (const id of ["tab-now", "tab-together"]) $(id).addEventListener("click", () => selectTab(id));
$("tab-now").parentElement.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const next = document.activeElement?.id === "tab-now" ? "tab-together" : "tab-now";
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

function showOnly(id) {
  for (const s of ["pair", "grant", "main"]) show(s, s === id);
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
    const label = `${navigator.userAgentData?.brands?.find((b) => !/Not.A.Brand|Chromium/i.test(b.brand))?.brand ?? "Browser"} su ${navigator.userAgentData?.platform || "computer"}`;
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

$("unpair-btn").addEventListener("click", async () => {
  await api("/api/extension/presence", { method: "DELETE" }).catch(() => {});
  await chrome.storage.local.remove(["token", "user"]);
  await render();
});

render();
