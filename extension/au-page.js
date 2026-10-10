// CineLoop: cosa sta guardando questa scheda di AnimeUnity.
//
// Gira solo su www.animeunity.so, dopo che l'utente ha concesso quel sito
// all'estensione. Legge titolo, episodio e avanzamento del video. Il parametro
// cineloopResume è un'indicazione di ripresa generata da CineLoop: viene
// applicata al video visibile una sola volta, quando i metadati sono pronti.
(() => {
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopAuPage === "function" && globalThis.__cineloopAuPage()) return;
  let stopped = false;
  globalThis.__cineloopAuPage = () => !stopped && alive();

  const EPISODE_WORD = /(?:^|\b)(?:Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const titleIdNow = () => /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(location.pathname)?.[1] ?? null;
  const params = new URLSearchParams(location.search);
  const requestedResume = Number(params.get("cineloopResume"));
  const resumeFraction = params.has("cineloopResume") && Number.isFinite(requestedResume)
    ? Math.min(1, Math.max(0, requestedResume))
    : null;
  let resumeApplied = false;

  /** L'anime che questa pagina sta mostrando, finche' non cambia pagina. */
  let known = { watchId: null, title: "", season: null, episode: null };
  let lastSent = "";
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

  function fromHeading() {
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
    const t = clean(document.title)
      .replace(/\s*[-|·]\s*anime\s*unity.*$/i, "")
      .replace(/\s*(streaming|download|sub\s*ita|ita)\s*.*$/i, "")
      .trim();
    if (!t) return null;
    const ep = EPISODE_WORD.exec(t);
    if (ep && ep.index > 0) return { title: t.slice(0, ep.index).trim() || t, episode: Number(ep[1]) };
    return { title: t.slice(0, 200) };
  }

  // Related titles include dubbed ITA copies. Episode markers must belong to
  // the current AnimeUnity numeric ID, not a linked related series.
  function belongsToCurrentAnime(el) {
    const id = titleIdNow();
    const link = el.closest?.("a[href]") ?? el.querySelector?.("a[href]");
    if (!id || !link) return Boolean(id);
    try {
      const path = new URL(link.href, location.href).pathname;
      return new RegExp("^/anime/" + id + "(?:[-/]|$)").test(path);
    } catch {
      return false;
    }
  }

  function currentEpisodeLink() {
    const match = /\/anime\/\d{1,9}[-/][^/]+\/(\d{1,9})(?:\/|$)/.exec(location.pathname);
    if (!match) return null;
    const currentPath = location.pathname.replace(/\/+$/, "");
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        if (new URL(link.href, location.href).pathname.replace(/\/+$/, "") === currentPath) return link;
      } catch {
        // Ignore malformed links.
      }
    }
    return null;
  }

  function episodeNumberFromElement(el) {
    if (!el) return null;
    const text = clean(el.textContent);
    const named = EPISODE_WORD.exec(text);
    if (named) return Number(named[1]);
    return /^\d{1,4}$/.test(text) ? Number(text) : null;
  }

  function activeEpisodeEl() {
    // Prefer the link for the exact episode ID in the current URL.
    const exact = currentEpisodeLink();
    if (episodeNumberFromElement(exact) !== null) return exact;
    const sel = '[class*="active" i], [class*="current" i], [class*="selected" i], [aria-current="true"]';
    for (const el of document.querySelectorAll(sel)) {
      if (!belongsToCurrentAnime(el)) continue;
      if (episodeNumberFromElement(el) !== null) return el;
    }
    return null;
  }

  function parseEpisodeFromDom() {
    // Never fall back to the first numbered link in the list: that is usually
    // episode 1, and related ITA titles can appear before the current episode.
    return episodeNumberFromElement(currentEpisodeLink());
  }

  function partSeasonFromPage() {
    const text = (location.pathname + " " + known.title + " " + document.title).toLowerCase();
    if (/the[-_\s]+blood[-_\s]+warfare|blood[-_\s]+warfare/.test(text)) return 1;
    if (/the[-_\s]+separation|\bseparation\b/.test(text)) return 2;
    if (/the[-_\s]+conflict|\bconflict\b/.test(text)) return 3;
    if (/the[-_\s]+calamity|\bcalamity\b/.test(text)) return 4;
    const numbered = /(?:season|stagione|part|parte|cour)\s*[-:]?\s*([1-9]\d?)/i.exec(text);
    return numbered ? Number(numbered[1]) : null;
  }

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

  function applyResume(video) {
    if (resumeApplied || resumeFraction === null || !video) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    try {
      video.currentTime = Math.max(0, Math.min(video.duration - 1, video.duration * resumeFraction));
      resumeApplied = true;
      // Remove the one-shot hint so a refresh won't seek repeatedly.
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("cineloopResume");
      history.replaceState(history.state, "", cleanUrl.toString());
    } catch {
      // The player may disallow seeking until it is ready; retry on next read.
    }
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
    if (known.season === null) known.season = partSeasonFromPage();
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
    applyResume(video);
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
