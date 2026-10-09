// CineLoop: cosa sta guardando questa scheda di StreamingCommunity.
//
// Girano solo sul dominio StreamingCommunity risolto da sc.js, dopo che
// l'utente ha concesso quel sito all'estensione. Sulla pagina di un titolo
// legge il nome della serie (h1 / titolo della scheda), la stagione e
// l'episodio selezionati, e quanto e' avanzato il video. I player di
// StreamingCommunity sono spesso iframe di altri domini: quelli si raggiungono
// solo se stesso-origin; altrimenti restano titolo, stagione ed episodio.
// Nient'altro viene letto, nulla viene modificato, nessuna richiesta parte:
// il risultato va al background worker dell'estensione.
(() => {
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopScPage === "function" && globalThis.__cineloopScPage()) return;
  let stopped = false;
  globalThis.__cineloopScPage = () => !stopped && alive();

  const SEASON_EPISODE = /(?:\bS|\bSt\.?|\bStagione|\bSeason|\bT|\bTemporada)\s*(\d{1,3})\s*[:,.·-]?\s*(?:E|Ep\.?|Episodio|Episode|Episodi)\s*(\d{1,4})/i;
  const EPISODE_ONLY = /(?:^|\b)(?:E|Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const titleIdNow = () => /\/titles?\/(\d{1,9})(?:[-/?#]|$)/.exec(location.pathname)?.[1] ?? null;

  /** La serie che questa pagina sta mostrando, finche' non cambia pagina. */
  let known = { watchId: null, title: "", season: null, episode: null };
  let lastSent = "";

  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const isMarker = (t) => SEASON_EPISODE.test(t) || EPISODE_ONLY.test(t);

  function fromHeading() {
    // Le pagine titolo di StreamingCommunity hanno un h1 con il nome del titolo.
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const text = clean(h1.textContent).replace(/\s*(streaming|stream)\s*ita.*$/i, "").trim();
    if (!text || isMarker(text)) return null;
    const inline = SEASON_EPISODE.exec(text) ?? /\s(?:E|Ep\.?|Episodio|Episode)\s*\d{1,4}\b/i.exec(text);
    const title = inline && inline.index > 0 ? text.slice(0, inline.index).trim() : text;
    return { title: title.slice(0, 200), season: null, episode: null };
  }

  function fromTitleTag() {
    // document.title e' tipo "Breaking Bad S1E1 - StreamingCommunity".
    const t = clean(document.title).replace(/\s*[-|·]\s*(streaming\s*community.*|streaming.*)$/i, "").trim();
    if (!t) return null;
    const both = SEASON_EPISODE.exec(t);
    if (both) return { title: t.slice(0, both.index).trim() || t, season: Number(both[1]), episode: Number(both[2]) };
    const ep = EPISODE_ONLY.exec(t);
    if (ep && ep.index > 0) return { title: t.slice(0, ep.index).trim() || t, season: null, episode: Number(ep[1]) };
    return { title: t.slice(0, 200), season: null, episode: null };
  }

  /** L'elemento dell'episodio attivo, se la pagina lo evidenzia. */
  function activeEpisodeEl() {
    const sel = '[class*="active" i], [class*="current" i], [class*="selected" i], [aria-current="true"]';
    for (const el of document.querySelectorAll(sel)) {
      if (EPISODE_ONLY.test(clean(el.textContent)) || SEASON_EPISODE.test(clean(el.textContent))) return el;
    }
    return null;
  }

  function parseEpisodeFromDom() {
    const texts = [...document.querySelectorAll("h1, h2, h3, [class*=episode i], [class*=episodio i], li, a, span, button")]
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length < 120);
    for (const t of texts) {
      const both = SEASON_EPISODE.exec(t);
      if (both) return { season: Number(both[1]), episode: Number(both[2]) };
    }
    for (const t of texts) {
      const only = EPISODE_ONLY.exec(t);
      if (only) return { season: null, episode: Number(only[1]) };
    }
    return { season: null, episode: null };
  }

  /** Il <video> piu' avanzato nel documento o negli iframe same-origin. */
  function findVideo(root = document, depth = 0) {
    if (depth > 2) return null;
    let best = null;
    for (const v of root.querySelectorAll("video")) {
      if (!Number.isFinite(v.duration) || v.duration <= 0) continue;
      if (!best || v.currentTime > best.currentTime) best = v;
    }
    for (const frame of root.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc) continue;
        const v = findVideo(doc, depth + 1);
        if (v && (!best || v.currentTime > best.currentTime)) best = v;
      } catch {
        // iframe di altro dominio: non leggibile, si ignora
      }
    }
    return best;
  }

  function read() {
    if (!alive()) return stop();
    const id = titleIdNow();
    if (!id) return;
    if (known.watchId !== id) known = { watchId: id, title: "", season: null, episode: null };
    for (const found of [fromHeading(), fromTitleTag()]) {
      if (!found) continue;
      if (found.title && !known.title) known.title = found.title;
      if (found.episode !== null && known.episode === null) known.episode = found.episode;
      if (found.season !== null && known.season === null) known.season = found.season;
    }
    const active = activeEpisodeEl();
    if (active) {
      const both = SEASON_EPISODE.exec(clean(active.textContent));
      const only = EPISODE_ONLY.exec(clean(active.textContent));
      if (both) { known.season = Number(both[1]); known.episode = Number(both[2]); }
      else if (only) known.episode = Number(only[1]);
    } else if (known.episode === null) {
      const guessed = parseEpisodeFromDom();
      if (guessed.episode !== null) { known.episode = guessed.episode; if (guessed.season !== null) known.season = guessed.season; }
    }
    const video = findVideo();
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const progress = duration ? Math.min(1, Math.max(0, video.currentTime / duration)) : null;
    const message = { type: "player-title", ...known, progress: progress === null ? null : Math.round(progress * 1000) / 1000 };
    const key = JSON.stringify(known);
    const now = Date.now();
    if (key === lastSent && now - (read.progressAt ?? 0) < 15_000) return;
    if (!known.title && known.episode === null && progress === null) return;
    lastSent = key;
    read.progressAt = now;
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      stop();
    }
  }

  let pending = null;
  const observer = new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = null;
      read();
    }, 800);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(read, 5000);
  function stop() {
    stopped = true;
    observer.disconnect();
    clearInterval(timer);
  }
  read();
})();
