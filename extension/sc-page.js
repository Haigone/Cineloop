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
  // StreamingCommunity può mostrare le puntate come "15. Titolo" invece di "Episodio 15".
  // La numerazione semplice è accettata solo nelle voci episodio o negli elementi attivi.
  const NUMBERED_EPISODE = /^\s*(?:ep(?:isodio)?\s*)?(\d{1,3})\s*[.：:–—-]\s+\S/i;
  function episodeNumber(text, allowOrdinal = false) {
    const value = clean(text);
    const both = SEASON_EPISODE.exec(value);
    if (both) return { season: Number(both[1]), episode: Number(both[2]) };
    const only = EPISODE_ONLY.exec(value);
    if (only) return { season: null, episode: Number(only[1]) };
    const numbered = allowOrdinal ? NUMBERED_EPISODE.exec(value) : null;
    return numbered ? { season: null, episode: Number(numbered[1]) } : null;
  }
  const titleIdNow = () => /\/(?:titles?\/(\d{1,9})|(?:[a-z]{2}\/)?watch\/(\d{1,9}))(?:[-/?#]|$)/i.exec(location.pathname)?.slice(1).find(Boolean) ?? null;

  /** La serie che questa pagina sta mostrando, finche' non cambia pagina. */
  let known = { watchId: null, title: "", season: null, episode: null, episodeId: null };
  let lastSent = "";
  let lastEpisodeKey = "";
  let lastProgressSentAt = 0;
  let boundVideo = null;
  const PROGRESS_SEND_INTERVAL_MS = 5_000;

  function bindVideo(video) {
    if (!video || boundVideo === video) return;
    boundVideo = video;
    const sendNow = () => read(true);
    video.addEventListener("timeupdate", () => {
      if (Date.now() - lastProgressSentAt >= PROGRESS_SEND_INTERVAL_MS) sendNow();
    });
    video.addEventListener("pause", sendNow);
    video.addEventListener("ended", () => read(true, 1));
    video.addEventListener("loadedmetadata", sendNow);
    video.addEventListener("seeked", sendNow);
  }

  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const cleanTitle = (s) => clean(s).replace(/^watch\s+/i, "").trim();
  const isMarker = (t) => SEASON_EPISODE.test(t) || EPISODE_ONLY.test(t);

  function titleFromText(raw) {
    let t = cleanTitle(raw)
      .replace(/\s*[-|·]\s*(streaming\s*community.*|streaming.*)$/i, "")
      .replace(/\s*(streaming|stream)\s*ita.*$/i, "").trim();
    if (!t || /^(streaming\s*community|streamingcommunityz?|home|watch|film|serie tv)$/i.test(t)) return null;
    const both = SEASON_EPISODE.exec(t);
    if (both) t = t.slice(0, both.index).trim();
    else {
      const ep = EPISODE_ONLY.exec(t);
      if (ep && ep.index > 0) t = t.slice(0, ep.index).trim();
    }
    if (!t || /^(streaming\s*community|streamingcommunityz?)$/i.test(t)) return null;
    return { title: t.slice(0, 200), season: null, episode: null };
  }

  function fromHeading() {
    // Preferisci il titolo visibile, ma considera anche i metadati social della pagina.
    const candidates = [
      document.querySelector("h1")?.textContent,
      document.querySelector('meta[property="og:title"]')?.content,
      document.querySelector('meta[name="twitter:title"]')?.content,
      document.querySelector('meta[itemprop="name"]')?.content,
      document.querySelector('[data-title]')?.getAttribute("data-title"),
    ];
    for (const candidate of candidates) {
      const found = titleFromText(candidate);
      if (found) return found;
    }
    return null;
  }

  function fromTitleTag() {
    // Il titolo della scheda e' spesso l'unico dato disponibile prima del rendering SPA.
    return titleFromText(document.title);
  }

  /** L'elemento dell'episodio attivo, preferendo la voce più specifica. */
  function activeEpisodeInfo() {
    const episodeId = new URL(location.href).searchParams.get("e");
    const candidates = new Set();
    // Prima associa l'ID e= della URL alla voce esatta dell'elenco: è più affidabile
    // delle classi CSS, che a volte marcano come attivo l'intero menu.
    if (episodeId) {
      for (const link of document.querySelectorAll("a[href]")) {
        try {
          const url = new URL(link.href, location.href);
          if (url.origin !== location.origin || url.searchParams.get("e") !== episodeId) continue;
          candidates.add(link);
          if (link.parentElement) candidates.add(link.parentElement);
        } catch {}
      }
    }
    const sel = '[class*="active" i], [class*="current" i], [class*="selected" i], [aria-current="true"]';
    for (const el of document.querySelectorAll(sel)) {
      candidates.add(el);
      // Alcuni temi marcano come attivo il contenitore dell'elenco, non la singola puntata.
      for (const child of el.querySelectorAll("a, li, button, [class*=episode i], [class*=episodio i], span")) candidates.add(child);
    }
    const matches = [...candidates]
      .map((el) => ({ text: clean(el.textContent), info: episodeNumber(el.textContent, true) }))
      .filter((item) => item.info && item.text.length < 200)
      .sort((a, b) => a.text.length - b.text.length);
    return matches[0]?.info ?? null;
  }

  function parseEpisodeFromDom() {
    const elements = [...document.querySelectorAll("h1, h2, h3, [class*=episode i], [class*=episodio i], li, a, span, button")];
    for (const el of elements) {
      if (!el.matches("[class*=episode i], [class*=episodio i]")) continue;
      const info = episodeNumber(el.textContent, true);
      if (info) return info;
    }
    for (const el of elements) {
      const info = episodeNumber(el.textContent, false);
      if (info) return info;
    }
    return { season: null, episode: null };
  }

  /** Find the next numbered episode link without guessing provider IDs. */
  function nextEpisodeInfo(currentEpisode, currentEpisodeId) {
    if (!Number.isInteger(currentEpisode) || currentEpisode < 1 || !currentEpisodeId) return null;
    const currentPath = location.pathname.replace(/\/+$/, "");
    const links = [];
    const seen = new Set();
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        const url = new URL(link.href, location.href);
        const episodeId = url.searchParams.get("e");
        if (url.origin !== location.origin || url.pathname.replace(/\/+$/, "") !== currentPath ||
            !episodeId || !/^\d{1,12}$/.test(episodeId) || seen.has(episodeId)) continue;
        seen.add(episodeId);
        const both = SEASON_EPISODE.exec(clean(link.textContent));
        const only = EPISODE_ONLY.exec(clean(link.textContent));
        const number = both ? Number(both[2]) : only ? Number(only[1]) : null;
        if (number !== null) links.push({ url, episodeId, number });
      } catch {}
    }
    const next = links.find((item) => item.episodeId !== currentEpisodeId && item.number === currentEpisode + 1) ?? null;
    if (!next) return null;
    next.url.hash = "";
    next.url.searchParams.delete("cineloopResume");
    return { url: next.url.toString(), episode: next.number };
  }

  /** Il <video> piu' avanzato nel documento o negli iframe same-origin. */
  function findVideo(root = document, depth = 0) {
    if (depth > 4) return null;
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

  function read(force = false, forcedProgress = null) {
    if (!alive()) return stop();
    const id = titleIdNow();
    // An accessible player iframe may use a different route than the title page.
    // Report only its fraction; background associates it with the identified title.
    if (!id) {
      const frameVideo = findVideo();
      // Capture playback events from accessible player iframes, not only polling.
      bindVideo(frameVideo);
      const frameDuration = frameVideo && Number.isFinite(frameVideo.duration) && frameVideo.duration > 0 ? frameVideo.duration : null;
      if (frameDuration) {
        const frameProgress = Math.round(Math.min(0.99, Math.max(0, frameVideo.currentTime / frameDuration)) * 100000) / 100000;
        const now = Date.now();
        if (force || now - lastProgressSentAt >= PROGRESS_SEND_INTERVAL_MS) {
          lastProgressSentAt = now;
          try { chrome.runtime.sendMessage({ type: "player-progress", progress: forcedProgress !== null ? Math.min(0.99, Math.max(0, forcedProgress)) : frameProgress, position: frameVideo.currentTime, duration: frameDuration, force }).catch(() => {}); } catch {}
        }
      }
      return;
    }
    if (known.watchId !== id) known = { watchId: id, title: "", season: null, episode: null, episodeId: null };
    const urlEpisodeId = new URL(location.href).searchParams.get("e");
    const nextEpisodeId = urlEpisodeId && /^\d{1,12}$/.test(urlEpisodeId) ? urlEpisodeId : null;
    // StreamingCommunity often switches episodes inside the same SPA route:
    // the series/watch ID stays put while ?e= changes. Do not keep the
    // previous episode number while the new episode UI is still rendering.
    const urlEpisodeChanged = known.episodeId !== nextEpisodeId;
    if (urlEpisodeChanged) {
      known.episodeId = nextEpisodeId;
      known.season = null;
      known.episode = null;
    }
    for (const found of [fromHeading(), fromTitleTag()]) {
      if (!found) continue;
      if (found.title && !known.title) known.title = found.title;
      // Refresh episode metadata instead of treating the first reading as final.
      if (found.episode !== null) known.episode = found.episode;
      if (found.season !== null) known.season = found.season;
    }
    const active = activeEpisodeInfo();
    if (active) {
      known.episode = active.episode;
      if (active.season !== null) known.season = active.season;
    } else if (known.episode === null) {
      const guessed = parseEpisodeFromDom();
      if (guessed.episode !== null) { known.episode = guessed.episode; if (guessed.season !== null) known.season = guessed.season; }
    }
    const video = findVideo();
    bindVideo(video);
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const rawProgress = forcedProgress !== null ? Math.min(0.99, Math.max(0, forcedProgress)) : duration ? Math.min(0.99, Math.max(0, video.currentTime / duration)) : null;
    const progress = rawProgress === null ? null : Math.round(rawProgress * 100000) / 100000;
    const next = nextEpisodeInfo(known.episode, known.episodeId);
    const message = {
      type: "player-title", ...known, pageUrl: location.href, progress, ended: forcedProgress === 1,
      position: video && Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : null,
      duration, force,
      ...(next ? { nextEpisodeUrl: next.url, nextEpisode: next.episode } : {}),
    };
    const key = JSON.stringify(known);
    const now = Date.now();
    const episodeChanged = key !== lastEpisodeKey;
    if (!force && !episodeChanged && now - lastProgressSentAt < PROGRESS_SEND_INTERVAL_MS) return;
    if (!known.title && known.episode === null && progress === null) return;
    lastSent = key;
    lastEpisodeKey = key;
    lastProgressSentAt = now;
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
