import "./compat.js";
import { api, ApiError, getSettings } from "./api.js";
import { groupHistory, readNetflixFile } from "./netflix-export.js";

/*
 * Import of the Netflix viewing history (NetflixViewingHistory.csv): what the user watched and is
 * missing from the library is added. The file is read here, on the user's computer; only the titles
 * go to CineLoop, and nothing of the file is kept.
 * It runs in a tab, not in the popup, because a file picker would close the popup.
 */

const $ = (id) => document.getElementById(id);
const show = (id, visible) => ($(id).hidden = !visible);
const ALL = "";
const BATCH = 10;
const ENDPOINT = "/api/extension/import-history";
const HELP =
  "NetflixViewingHistory.csv, così come lo scarichi. Il file viene letto qui e non arriva a CineLoop: partono solo i nomi delle serie e dei film e i giorni in cui li hai guardati. Un film finisce in libreria come visto, una serie come vista fino all’ultima stagione che compare nello storico. Quello che hai già in libreria resta com’è, ma riceve i giorni di visione che mancano (le statistiche dei minuti non cambiano).";

/** What the chosen file holds, once read. */
let read = null;

async function init() {
  const { token, user } = await getSettings();
  $("who").textContent = user?.displayName ?? "";
  show("not-paired", !token);
  $("file").disabled = !token;
  $("file-help").textContent = HELP;
  reset();
}

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
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    // Only the history CSV: the full data export (.zip) holds much more than CineLoop needs.
    if (head[0] === 0x50 && head[1] === 0x4b) return fail("Carica solo NetflixViewingHistory.csv (Attività di visione › Scarica tutto), non l’archivio .zip.");
    found = await readNetflixFile(file, "history");
  } catch {
    return fail("Non riesco ad aprire questo file. Carica il file che hai scaricato da Netflix, senza modificarlo.");
  }
  if (found.type !== "history") return fail("Non riconosco questo file: carica NetflixViewingHistory.csv da Attività di visione › Scarica tutto.");
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
  return groupHistory(rows).map(({ title, kind, season, sample, watched }) => ({ title, kind, sample, ...(season ? { season } : {}), ...(watched.length ? { watched } : {}) }));
}

function renderCount() {
  const n = chosen().length;
  const skipped = read?.skipped ? ` Saltate ${read.skipped} righe tra trailer, anteprime e visioni sotto i due minuti.` : "";
  $("count").textContent = `${n === 1 ? "1 titolo nello storico" : `${n} titoli nello storico`}.${skipped}`;
  $("import-btn").textContent = n === 1 ? "Importa 1 titolo" : `Importa ${n} titoli`;
  $("import-btn").disabled = n === 0;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One batch. On the per-minute limit it waits a minute; when CineLoop does not answer
 * (a timeout, a hiccup) it tries twice more, then gives up on this batch only.
 */
async function send(endpoint, items) {
  for (let attempt = 0, busy = 0; ; attempt++) {
    try {
      return await api(endpoint, { method: "POST", body: { items, partial: true } });
    } catch (err) {
      // Refused as it is (401: not paired, 400: unreadable): sending it again changes nothing.
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) throw err;
      if (err instanceof ApiError && err.status === 429) {
        if (++busy > 3) throw err;
        $("import-status").textContent += " Pausa di un minuto per non sovraccaricare CineLoop, poi continuo da solo.";
        await wait(61_000);
        continue;
      }
      if (attempt >= 2) throw err;
      await wait(5_000 * (attempt + 1));
    }
  }
}

/** A plain-text log of what could not be matched, to download. */
function errorLog(notFound) {
  const lines = [
    "CineLoop · importazione dello storico visioni di Netflix",
    new Date().toLocaleString("it-IT"),
    "",
    `Titoli non importati: ${notFound.length}`,
    "Puoi aggiungerli a mano cercandoli su CineLoop: spesso il nome su Netflix è diverso da quello del catalogo.",
    "",
    ...notFound.map((n) => {
      const line = n.sample && n.sample !== n.title ? `- ${n.title}    (riga di Netflix: "${n.sample}")` : `- ${n.title}`;
      return n.failed ? `${line}    [CineLoop non ha risposto: riprova a importare il file]` : line;
    }),
  ];
  return URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
}

$("import-btn").addEventListener("click", async () => {
  const items = chosen();
  const btn = $("import-btn");
  btn.disabled = true;
  $("file").disabled = true;
  show("import-status", true);
  show("import-missing", false);
  show("log-link", false);
  const total = { added: 0, days: 0, already: 0, notFound: [] };
  const queue = [...items];
  let done = 0;
  let failedInARow = 0;
  try {
    while (queue.length > 0) {
      $("import-status").textContent = `Importo… ${done} di ${items.length}`;
      const batch = queue.splice(0, BATCH);
      let res;
      try {
        res = await send(ENDPOINT, batch);
      } catch (err) {
        // Three batches in a row with no answer: CineLoop is down, stop here.
        if ((err instanceof ApiError && err.status === 401) || ++failedInARow >= 3) throw err;
        // This batch failed even after waiting: it goes in the log, the import goes on.
        total.notFound.push(...batch.map((b) => ({ title: b.title, sample: b.sample, failed: true })));
        done += batch.length;
        continue;
      }
      failedInARow = 0;
      // What the server had no time for comes back: it goes first in the next batch.
      const pending = Array.isArray(res.pending) ? res.pending : [];
      queue.unshift(...pending);
      done += batch.length - pending.length;
      total.added += res.added.length;
      total.days += res.days ?? 0;
      total.already += res.already;
      total.notFound.push(...res.notFound.map((n) => (typeof n === "string" ? { title: n } : n)));
    }
    const failed = total.notFound.filter((n) => n.failed).length;
    const missing = total.notFound.length - failed;
    $("import-status").textContent = [
      `Aggiunti alla libreria: ${total.added}.`,
      total.days ? `Date di visione registrate: ${total.days}.` : "",
      total.already ? `Già su CineLoop: ${total.already}.` : "",
      missing ? `Non trovati nel catalogo: ${missing}.` : "",
      failed ? `Non importati perché CineLoop non ha risposto: ${failed} (sono nel log, riprova più tardi).` : "",
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
      $("log-link").href = errorLog(total.notFound);
      show("log-link", true);
    }
  } catch (err) {
    $("import-status").textContent =
      err instanceof ApiError && err.status === 401
        ? "L’estensione non è più collegata: ricollegala dal pannello e riprova. I titoli già importati non si duplicano."
        : `Importazione interrotta dopo ${done} titoli su ${items.length}: CineLoop non risponde. Riprova più tardi, i titoli già importati non si duplicano.`;
  } finally {
    btn.disabled = false;
    $("file").disabled = false;
  }
});

init();
