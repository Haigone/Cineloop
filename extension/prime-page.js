// CineLoop: cosa sta suonando nel player di Prime Video.
//
// Gira solo su www.primevideo.com e www.amazon.it/gp/video. Prime Video apre il
// player sopra la pagina del titolo, quindi l'indirizzo non basta: quando il
// player è aperto legge la riga del titolo (serie, stagione, episodio), i
// metadati che la pagina dà al browser e il punto del video. Nient'altro della
// pagina, nessuna modifica, nessuna richiesta: tutto va al background
// dell'estensione.
(() => {
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopPrime === "function" && globalThis.__cineloopPrime()) return;
  let stopped = false;
  globalThis.__cineloopPrime = () => !stopped && alive();

  /** "Stagione 1, Ep. 3", "St. 1 Ep. 3", "Season 1, Ep. 3", "S1 E3". */
  const SEASON_EPISODE = /(?:\bStagione|\bSeason|\bSt\.?|\bS)\s*(\d{1,3})\s*[,:.·-]?\s*(?:Ep\.?|Episodio|Episode|E)\s*(\d{1,4})/i;
  const EPISODE_ONLY = /^(?:Ep\.?|Episodio|Episode)\s*(\d{1,4})\b/i;
  const ID = /\/(?:detail|dp)\/(?:[^/]+\/)?([A-Z0-9]{10,40}|amzn1\.dv\.gti\.[0-9a-f-]{36})(?:[/?#]|$)/;
  const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  function player() {
    const box = document.querySelector(".webPlayerSDKContainer, #dv-web-player");
    if (!box || box.getClientRects().length === 0) return null;
    // Un video con dei fotogrammi: il player aperto ma ancora vuoto non conta.
    const video = [...box.querySelectorAll("video")].find((v) => v.readyState >= 2 || (Number.isFinite(v.duration) && v.duration > 0));
    return video ? { box, video } : null;
  }

  /** "12:34 / 45:00" o "12:34 / -32:26" nel player, quando c'è. */
  function fromTimeIndicator() {
    const m = /(\d{1,2}(?::\d{2}){1,2})\s*\/\s*(-?)(\d{1,2}(?::\d{2}){1,2})/.exec(text(".atvwebplayersdk-timeindicator-text"));
    if (!m) return null;
    const secs = (s) => s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
    const at = secs(m[1]);
    const total = m[2] ? at + secs(m[3]) : secs(m[3]);
    return total > 0 ? Math.min(1, at / total) : null;
  }

  function episodeOf(texts) {
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

  let wasOpen = false;
  let lastKey = "";
  let sentAt = 0;

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      stop();
    }
  }

  function read() {
    if (!alive()) return stop();
    const found = player();
    if (!found) {
      if (wasOpen) send({ type: "prime-player", open: false });
      wasOpen = false;
      return;
    }
    const meta = navigator.mediaSession?.metadata;
    const title = (text(".atvwebplayersdk-title-text") || meta?.title || "").slice(0, 200);
    const subtitle = text(".atvwebplayersdk-subtitle-text");
    const { season, episode } = episodeOf([subtitle, meta?.artist ?? "", meta?.album ?? ""].filter(Boolean));
    const { video } = found;
    const fromVideo = Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : null;
    const fraction = fromTimeIndicator() ?? fromVideo;
    const id = ID.exec(location.pathname)?.[1] ?? null;
    if (!id && !title) return;
    const message = {
      type: "prime-player",
      open: true,
      playing: !video.paused,
      watchId: id ?? `title:${title.toLowerCase()}`,
      title,
      season,
      episode,
      progress: fraction === null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 1000,
    };
    // Subito quando cambia cosa c'è sullo schermo, altrimenti ogni 20 secondi
    // per dire che il player è ancora aperto.
    const key = JSON.stringify([message.watchId, title, season, episode, message.playing]);
    if (key === lastKey && Date.now() - sentAt < 20_000) return;
    lastKey = key;
    sentAt = Date.now();
    wasOpen = true;
    send(message);
  }

  const timer = setInterval(read, 5000);
  function stop() {
    stopped = true;
    clearInterval(timer);
  }
  read();
})();
