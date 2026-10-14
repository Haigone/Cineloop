import "./compat.js";
import { api, ApiError, getSettings } from "./api.js";
import { groupHistory, readNetflixFile, uniqueTitles } from "./netflix-export.js";

/*
 * Import from Netflix's own files: "La mia lista" goes to the wishlist, the
 * viewing history fills in the library. The file is read here, on the user's
 * computer; only the titles go to CineLoop, and nothing of the file is kept.
 * It runs in a tab, not in the popup, because a file picker would close the popup.
 */

const $ = (id) => document.getElementById(id);
const show = (id, visible) => ($(id).hidden = !visible);
const ALL = "";
const BATCH = 20;

const MODES = {
  list: {
    help: "Va bene lo .zip così com’è, oppure solo CONTENT_INTERACTION/MyList.csv. L’estensione legge solo La mia lista (nome del profilo e titolo); il resto dell’archivio non viene aperto e non lascia il tuo computer.",
    endpoint: "/api/extension/import-list",
    noun: ["titolo in La mia lista", "titoli in La mia lista"],
    added: "Aggiunti alla wishlist",
  },
  history: {
    help: "NetflixViewingHistory.csv, oppure lo .zip dell’export. Il file viene letto qui e non arriva a CineLoop: partono solo i nomi delle serie e dei film. Un film finisce in libreria come visto, una serie come vista fino all’ultima stagione che compare nello storico. Quello che hai già in libreria non cambia.",
    endpoint: "/api/extension/import-history",
    noun: ["titolo nello storico", "titoli nello storico"],
    added: "Aggiunti alla libreria",
  },
};

/** What the chosen file holds, once read. */
let read = null;
let mode = new URLSearchParams(location.search).get("mode") === "history" ? "history" : "list";

async function init() {
  const { token, user } = await getSettings();
  $("who").textContent = user?.displayName ?? "";
  show("not-paired", !token);
  $("file").disabled = !token;
  setMode(mode);
}

function setMode(next) {
  mode = next;
  for (const input of document.querySelectorAll('input[name="mode"]')) input.checked = input.value === mode;
  for (const card of document.querySelectorAll("[data-mode]")) card.hidden = card.dataset.mode !== mode;
  $("file-help").textContent = MODES[mode].help;
  reset();
  $("file").value = "";
}

for (const input of document.querySelectorAll('input[name="mode"]')) input.addEventListener("change", () => setMode(input.value));

function reset() {
  read = null;
  for (const id of ["preview", "file-error", "import-status", "import-missing", "log-link"]) show(id, false);
}

function fail(message) {
  reset();
  $("file-error").textContent = message;
  show("file-error", true);
}

$("file").addEventListener("change", async () => {
  const file = $("file").files?.[0];
  reset();
  if (!file) return;
  let found;
  try {
    found = await readNetflixFile(file, mode);
  } catch {
    return fail("Non riesco ad aprire questo file. Carica il file che hai scaricato da Netflix, senza modificarlo.");
  }
  if (found.type === "missing") {
    return fail(
      mode === "history"
        ? "In questo archivio non c’è lo storico (ViewingActivity.csv). Controlla che sia l’export di “Scarica le tue informazioni personali”, oppure carica NetflixViewingHistory.csv."
        : "In questo archivio non c’è La mia lista (MyList.csv). Controlla che sia l’export di “Scarica le tue informazioni personali”.",
    );
  }
  if (found.type === "unknown") return fail("Non riconosco questo file: non sembra né La mia lista né lo storico di Netflix.");
  if (found.type !== mode) {
    // The user picked the other kind of file: switch, keep it.
    mode = found.type;
    for (const input of document.querySelectorAll('input[name="mode"]')) input.checked = input.value === mode;
    for (const card of document.querySelectorAll("[data-mode]")) card.hidden = card.dataset.mode !== mode;
    $("file-help").textContent = MODES[mode].help;
  }
  if (found.items.length === 0) return fail("Il file non contiene titoli.");
  read = found;

  const options = found.profiles.length > 1 ? [...found.profiles, ALL] : [];
  $("profile").replaceChildren(
    ...options.map((p) => {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = `${p === ALL ? "Tutti i profili" : p} (${chosen(p).length})`;
      return o;
    }),
  );
  show("profile-row", options.length > 0);
  renderCount();
  show("preview", true);
});

$("profile").addEventListener("change", renderCount);

/** The items to send for a profile, without duplicates. */
function chosen(profile = read && read.profiles.length > 1 ? $("profile").value : ALL) {
  if (!read) return [];
  const rows = read.items.filter((i) => profile === ALL || i.profile === profile);
  if (read.type === "list") return uniqueTitles(rows).map((title) => ({ title }));
  return groupHistory(rows).map(({ title, kind, season, sample }) => ({ title, kind, sample, ...(season ? { season } : {}) }));
}

function renderCount() {
  const n = chosen().length;
  const [one, many] = MODES[mode].noun;
  const skipped = read?.type === "history" && read.skipped ? ` Saltate ${read.skipped} righe tra trailer, anteprime e visioni sotto i due minuti.` : "";
  $("count").textContent = `${n === 1 ? `1 ${one}` : `${n} ${many}`}.${skipped}`;
  $("import-btn").textContent = n === 1 ? "Importa 1 titolo" : `Importa ${n} titoli`;
  $("import-btn").disabled = n === 0;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One batch; on the per-minute limit it waits and tries again. */
async function send(endpoint, items) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api(endpoint, { method: "POST", body: { items } });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 429) || attempt >= 3) throw err;
      $("import-status").textContent += " Pausa di un minuto per non sovraccaricare CineLoop, poi continuo da solo.";
      await wait(61_000);
    }
  }
}

/** A plain-text log of what could not be matched, to download. */
function errorLog(kind, notFound) {
  const lines = [
    `CineLoop · importazione da Netflix (${kind === "history" ? "storico visioni" : "La mia lista"})`,
    new Date().toLocaleString("it-IT"),
    "",
    `Titoli non collegati al catalogo: ${notFound.length}`,
    "Puoi aggiungerli a mano cercandoli su CineLoop: spesso il nome su Netflix è diverso da quello del catalogo.",
    "",
    ...notFound.map((n) => (n.sample && n.sample !== n.title ? `- ${n.title}    (riga di Netflix: "${n.sample}")` : `- ${n.title}`)),
  ];
  return URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
}

$("import-btn").addEventListener("click", async () => {
  const items = chosen();
  const kind = read.type;
  const { endpoint, added } = MODES[kind];
  const btn = $("import-btn");
  btn.disabled = true;
  $("file").disabled = true;
  show("import-status", true);
  show("import-missing", false);
  show("log-link", false);
  const total = { added: 0, already: 0, notFound: [] };
  try {
    for (let i = 0; i < items.length; i += BATCH) {
      $("import-status").textContent = `Importo… ${Math.min(i + BATCH, items.length)} di ${items.length}`;
      const res = await send(endpoint, items.slice(i, i + BATCH));
      total.added += res.added.length;
      total.already += res.already;
      total.notFound.push(...res.notFound.map((n) => (typeof n === "string" ? { title: n } : n)));
    }
    $("import-status").textContent = [
      `${added}: ${total.added}.`,
      total.already ? `Già su CineLoop: ${total.already}.` : "",
      total.notFound.length ? `Non trovati nel catalogo: ${total.notFound.length}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    $("import-missing").replaceChildren(
      ...total.notFound.map((n) => {
        const li = document.createElement("li");
        li.textContent = n.title;
        if (n.sample && n.sample !== n.title) li.title = n.sample;
        return li;
      }),
    );
    show("import-missing", total.notFound.length > 0);
    if (total.notFound.length > 0) {
      $("log-link").href = errorLog(kind, total.notFound);
      show("log-link", true);
    }
  } catch (err) {
    $("import-status").textContent =
      err instanceof ApiError && err.status === 401
        ? "L’estensione non è più collegata: ricollegala dal pannello e riprova. I titoli già importati non si duplicano."
        : "Importazione interrotta: CineLoop non risponde. Riprova, i titoli già importati non si duplicano.";
  } finally {
    btn.disabled = false;
    $("file").disabled = false;
  }
});

init();
