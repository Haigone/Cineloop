// CineLoop: what is playing in this Netflix tab.
//
// Runs only on www.netflix.com, and only after the user granted that site to
// the extension. On a /watch page it reads what names the thing on screen:
// the title line of the player (shown while the controls are visible) and the
// media metadata the page gives the browser, plus how far the video is. Nothing
// else on the page is read, nothing is changed, and no request is made: the
// result goes to the extension's own background worker.
(() => {
  // A copy left behind by an earlier version of the extension can no longer
  // talk to it (its context is gone): only a live copy stops this one.
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopPlayerTitle === "function" && globalThis.__cineloopPlayerTitle()) return;
  let stopped = false;
  globalThis.__cineloopPlayerTitle = () => !stopped && alive();

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

  const isEpisodeMarker = (t) => SEASON_EPISODE.test(t) || EPISODE_ONLY.test(t.trim());

  /** The texts of the title line, one per element that holds text of its own. */
  function lines(box) {
    const out = [];
    for (const el of box.querySelectorAll("*")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(" ");
      const text = own.replace(/\s+/g, " ").trim();
      if (text) out.push(text);
    }
    return out.length ? out : [(box.textContent ?? "").replace(/\s+/g, " ").trim()].filter(Boolean);
  }

  function fromPlayer() {
    const box = document.querySelector('[data-uia="video-title"]');
    if (!box) return null;
    const texts = lines(box);
    // The show is the heading when there is one, else the first line that is not
    // "S4:E3" (a film has just its name). The episode's own name comes after it.
    const heading = box.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    let title = heading || texts.find((t) => !isEpisodeMarker(t)) || "";
    // "Stranger Things S4:E3 Capitolo tre" written as a single line.
    const inline = SEASON_EPISODE.exec(title) ?? /\s(?:E|Ep\.?|Episodio|Episode)\s*\d{1,4}\b/i.exec(title);
    if (inline && inline.index > 0) title = title.slice(0, inline.index).trim();
    return { title, ...parseEpisode(texts) };
  }

  function fromMediaSession() {
    const m = navigator.mediaSession?.metadata;
    if (!m?.title) return null;
    const fields = [m.title, m.artist, m.album].filter(Boolean);
    const show = fields.find((f) => !isEpisodeMarker(f)) ?? "";
    return { title: show, ...parseEpisode(fields) };
  }

  function read() {
    if (!alive()) return stop();
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
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      stop();
    }
  }

  // The title line appears only while the player's controls are showing (mouse
  // moved, video paused): catch it when it does, and look again every few seconds.
  let pending = null;
  const observer = new MutationObserver(() => {
    pending ??= setTimeout(() => {
      pending = null;
      if (document.querySelector('[data-uia="video-title"]')) read();
    }, 500);
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
