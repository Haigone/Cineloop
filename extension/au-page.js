// CineLoop: cosa sta guardando questa scheda di AnimeUnity.
//
// Gira solo su www.animeunity.so, dopo che l'utente ha concesso quel sito
// all'estensione. Sulla pagina di un anime (/anime/{id}-slug) legge il nome
// (h1 della scheda), l'episodio selezionato nella lista e quanto e' avanzato
// il video. Il player di AnimeUnity e' nella pagina stessa, quindi il
// progresso e' sempre leggibile. Nient'altro viene letto, nulla viene
// modificato, nessuna richiesta parte: il risultato va al background worker.
(() => {
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopAuPage === "function" && globalThis.__cineloopAuPage()) return;
  let stopped = false;
  globalThis.__cineloopAuPage = () => !stopped && alive();

  const EPISODE_WORD = /(?:^|\b)(?:Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const titleIdNow = () => /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(location.pathname)?.[1] ?? null;

  /** L'anime che questa pagina sta mostrando, finche' non cambia pagina. */
  let known = { watchId: null, title: "", season: null, episode: null };
  let lastSent = "";
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

  function fromHeading() {
    // La scheda anime ha un h1 con il titolo (a volte seguito da "Streaming" o simili).
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const text = clean(h1.textContent)
      .replace(/\s*(streaming|download|sub\s*ita|ita)\s*.*$/i, "")
      .replace(/\s*(episodio|episode)\s*\d{1,4}\s*.*$/i, "")
      .trim();
    if (!text || /^\d{1,4}$/.test(text)) return null;
    return { title: text.slice(0, 200) };
  }

  function fromTitleTag() {
    // document.title e' tipo "One Piece Episodio 1080 Streaming ITA ... - AnimeUnity".
    const t = clean(document.title)
      .replace(/\s*[-|·]\s*anime\s*unity.*$/i, "")
      .replace(/\s*(streaming|download|sub\s*ita|ita)\s*.*$/i, "")
      .trim();
    if (!t) return null;
    const ep = EPISODE_WORD.exec(t);
    if (ep && ep.index > 0) return { title: t.slice(0, ep.index).trim() || t, episode: Number(ep[1]) };
    return { title: t.slice(0, 200) };
  }

  /** L'elemento dell'episodio attivo, se la lista lo evidenzia. */
  function activeEpisodeEl() {
    const sel = '[class*="active" i], [class*="current" i], [class*="selected" i], [aria-current="true"]';
    for (const el of document.querySelectorAll(sel)) {
      const t = clean(el.textContent);
      if (EPISODE_WORD.test(t) || /^\d{1,4}$/.test(t)) return el;
    }
    return null;
  }

  function parseEpisodeFromDom() {
    // I pulsanti episodio di AnimeUnity sono numeri puri ("1080") o "Episodio 1080".
    const candidates = [...document.querySelectorAll("[class*=episode i], [class*=episodio i], a, button, li, span")]
      .map((el) => clean(el.textContent))
      .filter((t) => t && t.length <= 30);
    for (const t of candidates) {
      const m = EPISODE_WORD.exec(t);
      if (m) return Number(m[1]);
    }
    for (const t of candidates) {
      if (/^\d{1,4}$/.test(t)) return Number(t);
    }
    return null;
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
      if (found.episode !== undefined && found.episode !== null && known.episode === null) known.episode = found.episode;
    }
    const active = activeEpisodeEl();
    if (active) {
      const t = clean(active.textContent);
      const m = EPISODE_WORD.exec(t);
      known.episode = m ? Number(m[1]) : Number(t);
    } else if (known.episode === null) {
      const guessed = parseEpisodeFromDom();
      if (guessed !== null) known.episode = guessed;
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
