// CineLoop: what is playing in this Netflix tab.
//
// Runs only on www.netflix.com, and only after the user granted that site to
// the extension. On a /watch page it reads what names the thing on screen:
// the title line of the player (shown while the controls are visible) and the
// media metadata the page gives the browser, plus how far the video is. Nothing
// else on the page is read, nothing is changed, and no request is made: the
// result goes to the extension's own background worker.
(() => {
  if (globalThis.__cineloopPlayerTitle) return;
  globalThis.__cineloopPlayerTitle = true;

  /** "S4:E3", "St. 4 Ep. 3", "Stagione 4: Episodio 3", "T4:E3", "Season 4 Episode 3". */
  const SEASON_EPISODE = /(?:\bS|\bSt\.?|\bStagione|\bSeason|\bT|\bTemporada)\s*(\d{1,3})\s*[:,.·-]?\s*(?:E|Ep\.?|Episodio|Episode|Episodi)\s*(\d{1,4})/i;
  /** An episode on its own: "E3", "Ep. 3", "Episodio 3", "Episode 3". */
  const EPISODE_ONLY = /^(?:E|Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const watchIdNow = () => /^\/watch\/(\d{1,12})/.exec(location.pathname)?.[1] ?? null;

  /** What the player last named, kept until the episode changes. */
  let known = { watchId: null, title: "", season: null, episode: null };
  let lastSent = "";

  function parseEpisode(texts) {
    for (const t of texts) {
      const both = SEASON_EPISODE.exec(t);
      if (both) return { season: Number(both[1]), episode: Number(both[2]) };
    }
    for (const t of texts) {
      const only = EPISODE_ONLY.exec(t.trim());
      if (only) return { season: null, episode: Number(only[1]) };
    }
    return { season: null, episode: null };
  }

  function fromPlayer() {
    const box = document.querySelector('[data-uia="video-title"]');
    if (!box) return null;
    const show = box.querySelector("h4")?.textContent?.trim() ?? "";
    const parts = [...box.querySelectorAll("span")].map((s) => (s.textContent ?? "").trim()).filter(Boolean);
    // A film has just its name, sometimes without an <h4>.
    const title = show || (parts.length ? "" : (box.textContent ?? "").trim());
    return { title, ...parseEpisode(parts.length ? parts : [box.textContent ?? ""]) };
  }

  function fromMediaSession() {
    const m = navigator.mediaSession?.metadata;
    if (!m?.title) return null;
    const fields = [m.title, m.artist, m.album].filter(Boolean);
    const show = fields.find((f) => !SEASON_EPISODE.test(f) && !EPISODE_ONLY.test(f)) ?? "";
    return { title: show, ...parseEpisode(fields) };
  }

  function read() {
    const id = watchIdNow();
    if (!id) return;
    if (known.watchId !== id) known = { watchId: id, title: "", season: null, episode: null };
    for (const found of [fromPlayer(), fromMediaSession()]) {
      if (!found) continue;
      if (found.title && !known.title) known.title = found.title.replace(/\s+/g, " ").slice(0, 200);
      if (found.episode !== null && known.episode === null) known.episode = found.episode;
      if (found.season !== null && known.season === null) known.season = found.season;
    }
    const video = document.querySelector("video");
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const progress = duration ? Math.min(1, Math.max(0, video.currentTime / duration)) : null;
    const message = { type: "player-title", ...known, progress: progress === null ? null : Math.round(progress * 1000) / 1000 };
    // Send names as soon as they appear; progress alone at most every half minute.
    const key = JSON.stringify(known);
    const now = Date.now();
    if (key === lastSent && now - (read.progressAt ?? 0) < 30_000) return;
    if (!known.title && progress === null) return;
    lastSent = key;
    read.progressAt = now;
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  // The title line appears only while the player's controls are showing (mouse
  // moved, video paused): catch it when it does, and look again every few seconds.
  let pending = null;
  new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = null;
      if (document.querySelector('[data-uia="video-title"]')) read();
    }, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });
  read();
  setInterval(read, 5000);
})();
