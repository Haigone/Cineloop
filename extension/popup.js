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
  show("party", Boolean(w));
  if (!w) return;

  $("watching-title").textContent = w.title ? w.title.title : (w.label ?? "Titolo da confermare");
  const ep = w.season && w.episode ? `S${w.season} · E${w.episode}` : "";
  $("watching-meta").textContent = [w.title?.year, ep, "su Netflix"].filter(Boolean).join(" · ");
  const company = [...w.with, ...w.guests];
  show("with", company.length > 0);
  $("with").textContent = company.length ? `Con te: ${company.join(", ")}` : "";
  if (document.activeElement !== $("party-url")) $("party-url").value = w.partyUrl ?? "";
  show("change-btn", Boolean(w.title) && !changing);
  if (!w.title || changing) renderChoices($("suggestions"), status.suggestions);
}

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
