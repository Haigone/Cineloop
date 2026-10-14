import "./compat.js";
import { api, ApiError, getSettings } from "./api.js";
import { listFromFile, uniqueTitles } from "./netflix-export.js";

/*
 * Import of "La mia lista" from Netflix's official data export. It runs in a
 * tab, not in the popup, because a file picker would close the popup.
 */

const $ = (id) => document.getElementById(id);
const show = (id, visible) => ($(id).hidden = !visible);
const ALL = "";
const BATCH = 20;

/** @type {{ profiles: string[], items: { profile: string, title: string }[] } | null} */
let list = null;

async function init() {
  const { token, user } = await getSettings();
  $("who").textContent = user?.displayName ?? "";
  show("not-paired", !token);
  $("file").disabled = !token;
}

function fail(message) {
  list = null;
  show("preview", false);
  $("file-error").textContent = message;
  show("file-error", true);
}

$("file").addEventListener("change", async () => {
  const file = $("file").files?.[0];
  show("file-error", false);
  show("import-status", false);
  show("import-missing", false);
  if (!file) return;
  let read;
  try {
    read = await listFromFile(file);
  } catch {
    return fail("Non riesco ad aprire questo file. Carica lo .zip che hai scaricato da Netflix, senza modificarlo, oppure MyList.csv.");
  }
  if (read === "no_list") return fail("In questo archivio non c’è La mia lista (MyList.csv). Controlla che sia l’export di “Scarica le tue informazioni personali”.");
  if (read === "history") return fail("Questa è la cronologia delle visioni, non La mia lista. Serve MyList.csv, che trovi nella cartella CONTENT_INTERACTION dell’export.");
  if (!read || read.items.length === 0) return fail("Il file non contiene titoli di La mia lista.");
  list = read;

  const options = read.profiles.length > 1 ? [...read.profiles, ALL] : [];
  $("profile").replaceChildren(
    ...options.map((p) => {
      const o = document.createElement("option");
      o.value = p;
      const n = uniqueTitles(read.items.filter((i) => p === ALL || i.profile === p)).length;
      o.textContent = `${p === ALL ? "Tutti i profili" : p} (${n})`;
      return o;
    }),
  );
  show("profile-row", options.length > 0);
  renderCount();
  show("preview", true);
});

$("profile").addEventListener("change", renderCount);

function chosenTitles() {
  if (!list) return [];
  const profile = list.profiles.length > 1 ? $("profile").value : ALL;
  return uniqueTitles(list.items.filter((i) => profile === ALL || i.profile === profile));
}

function renderCount() {
  const titles = chosenTitles();
  $("count").textContent = titles.length === 1 ? "1 titolo in La mia lista." : `${titles.length} titoli in La mia lista.`;
  $("import-btn").textContent = titles.length === 1 ? "Importa 1 titolo" : `Importa ${titles.length} titoli`;
  $("import-btn").disabled = titles.length === 0;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One batch; on the per-minute limit it waits and tries again. */
async function send(items) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api("/api/extension/import-list", { method: "POST", body: { items } });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 429) || attempt >= 3) throw err;
      $("import-status").textContent += " Pausa di un minuto per non sovraccaricare CineLoop, poi continuo da solo.";
      await wait(61_000);
    }
  }
}

$("import-btn").addEventListener("click", async () => {
  const titles = chosenTitles();
  const btn = $("import-btn");
  btn.disabled = true;
  $("file").disabled = true;
  show("import-status", true);
  show("import-missing", false);
  const total = { added: 0, already: 0, notFound: [] };
  try {
    for (let i = 0; i < titles.length; i += BATCH) {
      $("import-status").textContent = `Importo… ${Math.min(i + BATCH, titles.length)} di ${titles.length}`;
      const res = await send(titles.slice(i, i + BATCH).map((title) => ({ title })));
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
