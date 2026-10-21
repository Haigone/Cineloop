// CineLoop: cosa sta guardando questa scheda di AnimeUnity.
//
// Gira sulle pagine AnimeUnity autorizzate. Legge titolo, episodio e avanzamento
// del video solo quando il monitoraggio CineLoop non è in pausa. Il parametro
// cineloopResume è un'indicazione di ripresa generata da CineLoop: viene
// applicata al video visibile una sola volta, quando i metadati sono pronti.
(() => {
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopAuPage === "function" && globalThis.__cineloopAuPage()) return;
  let stopped = false;
  let trackingPaused = true;
  globalThis.__cineloopAuPage = () => !stopped && alive();

  // Do not inspect player/page state while the user has paused CineLoop.
  chrome.storage.local.get("paused").then(({ paused }) => {
    trackingPaused = Boolean(paused);
    if (!trackingPaused) read(true);
  }).catch(() => {
    trackingPaused = false;
    read(true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.paused) return;
    trackingPaused = Boolean(changes.paused.newValue);
    if (!trackingPaused) read(true);
  });

  const EPISODE_WORD = /(?:^|\b)(?:Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const titleIdNow = () => /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(location.pathname)?.[1] ?? null;
  // Episode route ID is distinct from the title ID.
  const episodeIdNow = () => /\/anime\/\d{1,9}[-/][^/]+\/(\d{1,12})(?:\/|$)/.exec(location.pathname)?.[1] ?? null;
  const params = new URLSearchParams(location.search);
  const requestedResume = Number(params.get("cineloopResume"));
  const resumeFraction = params.has("cineloopResume") && Number.isFinite(requestedResume)
    ? Math.min(1, Math.max(0, requestedResume))
    : null;
  let resumeApplied = false;

  /** L'anime che questa pagina sta mostrando, finche' non cambia pagina. */
  let known = { watchId: null, title: "", season: null, episode: null, episodeId: null };
  let lastSent = "";
  let lastEpisodeKey = "";
  let lastProgressSentAt = 0;
  let boundVideo = null;
  const reportedFrameOrigins = new Set();
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

  let lastReZeroCheckAt = 0;
  let lastReZeroCheckId = null;
  let reZeroWarningKey = "";
  let dismissedReZeroWarningKey = "";

  function removeReZeroWarning() {
    document.getElementById("cineloop-rezero-edition-warning")?.remove();
    reZeroWarningKey = "";
  }

  function showReZeroWarning(id, choice) {
    const detected = id === "48" ? "Versione originale 2016 (ID 48)" : "Director’s Cut 2020 (ID 1973)";
    const selected = choice === "2016" ? "Versione originale 2016" : "Director’s Cut 2020";
    const key = id + ":" + choice;
    if (dismissedReZeroWarningKey === key) return;
    if (reZeroWarningKey === key && document.getElementById("cineloop-rezero-edition-warning")) return;
    removeReZeroWarning();
    reZeroWarningKey = key;

    const overlay = document.createElement("div");
    overlay.id = "cineloop-rezero-edition-warning";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-live", "assertive");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(8,10,18,.72);display:flex;align-items:center;justify-content:center;padding:20px;font:14px/1.5 system-ui,sans-serif;color:#171923";
    const card = document.createElement("section");
    card.style.cssText = "box-sizing:border-box;width:min(460px,100%);background:#fff;border-radius:14px;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.4)";
    const heading = document.createElement("h2");
    heading.textContent = "Attenzione: versione di Re:ZERO non corrispondente";
    heading.style.cssText = "font-size:18px;line-height:1.25;font-weight:750;margin:0 0 12px";
    const detail = document.createElement("p");
    detail.textContent = "AnimeUnity ha rilevato: " + detected + ". In CineLoop hai selezionato: " + selected + ".";
    detail.style.cssText = "margin:0 0 10px";
    const explanation = document.createElement("p");
    explanation.textContent = "ID e scelta non coincidono: il progresso potrebbe finire associato all’edizione sbagliata. Apri CineLoop e allinea la scelta alla pagina che vuoi guardare.";
    explanation.style.cssText = "margin:0 0 18px;color:#454958";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Ho capito";
    close.style.cssText = "border:0;border-radius:9px;background:#25283a;color:white;padding:10px 16px;font:inherit;font-weight:650;cursor:pointer";
    close.addEventListener("click", () => {
      dismissedReZeroWarningKey = key;
      overlay.remove();
    });
    card.append(heading, detail, explanation, close);
    overlay.append(card);
    document.documentElement.append(overlay);
    close.focus();
  }

  function checkReZeroEdition(id) {
    if (id !== "48" && id !== "1973") {
      lastReZeroCheckId = null;
      lastReZeroCheckAt = 0;
      removeReZeroWarning();
      return;
    }
    const now = Date.now();
    if (lastReZeroCheckId === id && now - lastReZeroCheckAt < 30_000) return;
    lastReZeroCheckId = id;
    lastReZeroCheckAt = now;
    try {
      chrome.runtime.sendMessage({ type: "rezero-choice" }).then((choice) => {
        if (titleIdNow() !== id) return;
        const mismatch = (id === "48" && choice === "directors-cut") ||
          (id === "1973" && choice === "2016");
        if (mismatch) showReZeroWarning(id, choice);
        else removeReZeroWarning();
      }).catch(() => {});
    } catch {}
  }

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

  /** The next numbered episode link on this exact AnimeUnity title page. */
  function nextEpisodeInfo(currentEpisode) {
    const titleId = titleIdNow();
    const currentLink = currentEpisodeLink();
    if (!titleId || !currentLink || !Number.isInteger(currentEpisode) || currentEpisode < 1) return null;
    const currentPath = new URL(currentLink.href, location.href).pathname.replace(/\/+$/, "");
    const links = [];
    const seen = new Set();
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        const url = new URL(link.href, location.href);
        const path = url.pathname.replace(/\/+$/, "");
        if (url.origin !== location.origin ||
            !new RegExp("^/anime/" + titleId + "[-/][^/]+/\\d{1,12}$").test(path) ||
            seen.has(path)) continue;
        seen.add(path);
        const number = episodeNumberFromElement(link);
        if (number !== null) links.push({ path, url, number });
      } catch {}
    }
    const next = links.find((item) => item.path !== currentPath && item.number === currentEpisode + 1) ?? null;
    if (!next) return null;
    next.url.hash = "";
    next.url.searchParams.delete("cineloopResume");
    return { url: next.url.toString(), episode: next.number };
  }

  function partSeasonFromPage() {
    const text = (location.pathname + " " + known.title + " " + document.title).toLowerCase();
    if (/the[-_\s]+blood[-_\s]+warfare|blood[-_\s]+warfare/.test(text)) return 1;
    if (/the[-_\s]+separation|\bseparation\b/.test(text)) return 2;
    if (/the[-_\s]+conflict|\bconflict\b/.test(text)) return 3;
    if (/the[-_\s]+calamity|\bcalamity\b/.test(text)) return 4;
    const numbered = /(?:season|stagione|part|parte|cour)\s*[-:]?\s*([1-9]\d?)/i.exec(text);
    if (numbered) return Number(numbered[1]);
    // AnimeUnity's Re:Zero episode URLs usually omit the season number.
    // Map the selected cut to season 1 (or namespace 101 server-side).
    // Detect explicit later-season slugs before defaulting the original title to season 1.
    const ordinalSeason = /(?:^|[-_\s])([2-9])(?:st|nd|rd|th)[-_\s]*season/i.exec(text);
    if (ordinalSeason) return Number(ordinalSeason[1]);
    if (/re\s*:?\s*zero/i.test(text)) return 1;
    return null;
  }

  // Visibility matters more than playback time: ad players can keep playing
  // while hidden behind the real AnimeUnity/VixCloud player. Position and
  // duration must always come from the same visible video element.
  function videoScore(v) {
    const rect = v.getBoundingClientRect();
    // A same-origin iframe's video belongs to its own Window. Use that window
    // for computed style and viewport checks; the parent Window may reject the
    // foreign-document element or score it against the wrong viewport.
    const view = v.ownerDocument?.defaultView ?? window;
    const style = view.getComputedStyle(v);
    const visible = rect.width >= 160 && rect.height >= 90 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < view.innerHeight && rect.left < view.innerWidth &&
      style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0.05;
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const playing = !v.paused && !v.ended && v.readyState >= 2;
    return (visible ? 1_000_000_000_000 : 0) +
      (playing ? 10_000_000_000 : 0) +
      (v.readyState >= 3 ? 100_000_000 : 0) +
      Math.min(area, 5_000_000) +
      Math.min(Math.max(0, v.currentTime || 0), 100_000);
  }

  function findVideo(root = document, depth = 0) {
    if (depth > 4) return null;
    const candidates = [];
    for (const v of root.querySelectorAll("video")) {
      if (v.readyState < 1 || !Number.isFinite(v.duration) || v.duration <= 0) continue;
      candidates.push({ video: v, score: videoScore(v) });
    }
    for (const frame of root.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc) continue;
        const found = findVideo(doc, depth + 1);
        if (found) candidates.push({ video: found, score: videoScore(found) });
      } catch {
        // Cross-origin frames are read by their own authorized content script.
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.video ?? null;
  }

  function applyResume(video) {
    if (resumeApplied || resumeFraction === null || !video) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    try {
      video.currentTime = Math.max(0, Math.min(video.duration - 0.25, video.duration * resumeFraction));
      resumeApplied = true;
      // Remove the one-shot hint so a refresh won't seek repeatedly.
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("cineloopResume");
      history.replaceState(history.state, "", cleanUrl.toString());
    } catch {
      // The player may disallow seeking until it is ready; retry on next read.
    }
  }

  function read(force = false, forcedProgress = null) {
    if (!alive()) return stop();
    if (trackingPaused) return;
    const id = titleIdNow();
    checkReZeroEdition(id);
    // Detect cross-origin player frames; the popup can request their permission.
    if (id) {
      for (const frame of document.querySelectorAll("iframe[src]")) {
        try {
          const frameUrl = new URL(frame.src, location.href);
          if (frameUrl.protocol !== "https:" || frameUrl.origin === location.origin || reportedFrameOrigins.has(frameUrl.origin)) continue;
          reportedFrameOrigins.add(frameUrl.origin);
          chrome.runtime.sendMessage({ type: "au-frame-origin", origin: frameUrl.origin }).catch(() => {});
        } catch {}
      }
    }
    // An accessible player iframe may use a different route than the title page.
    // Report only its fraction; background associates it with the identified title.
    if (!id) {
      const frameVideo = findVideo();
      // Bind playback events inside accessible player frames as well as polling.
      bindVideo(frameVideo);
      const frameDuration = frameVideo && Number.isFinite(frameVideo.duration) && frameVideo.duration > 0 ? frameVideo.duration : null;
      if (frameDuration) {
        const frameProgress = Math.round(Math.min(1, Math.max(0, frameVideo.currentTime / frameDuration)) * 100000) / 100000;
        const now = Date.now();
        if (force || now - lastProgressSentAt >= PROGRESS_SEND_INTERVAL_MS) {
          lastProgressSentAt = now;
          try { chrome.runtime.sendMessage({ type: "player-progress", progress: forcedProgress !== null ? forcedProgress : frameProgress, position: frameVideo.currentTime, duration: frameDuration, force }).catch(() => {}); } catch {}
        }
      }
      return;
    }
    if (known.watchId !== id) known = { watchId: id, title: "", season: null, episode: null, episodeId: null };
    known.episodeId = episodeIdNow();
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
    bindVideo(video);
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const rawProgress = forcedProgress !== null ? forcedProgress : duration ? Math.min(1, Math.max(0, video.currentTime / duration)) : null;
    const progress = rawProgress === null ? null : Math.round(rawProgress * 100000) / 100000;
    const next = nextEpisodeInfo(known.episode);
    const message = {
      type: "player-title", ...known, pageUrl: location.href, progress,
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
})();
