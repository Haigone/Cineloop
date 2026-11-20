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
  // StreamingCommunity serializza i dati Inertia in #app[data-page].
  let currentPageData = null;
  function readInertiaPage(page = null) {
    if (page && typeof page === "object") currentPageData = page;
    if (!currentPageData) {
      const raw = document.querySelector("#app")?.getAttribute("data-page");
      if (raw) { try { currentPageData = JSON.parse(raw); } catch { currentPageData = null; } }
    }
    return currentPageData;
  }
  function fromInertiaPage() {
    const page = readInertiaPage(); const props = page?.props;
    if (!props?.title || (page.component && !/^Titles\/(Watch|Title)$/i.test(page.component))) return null;
    const ep = props.episode;
    const sv = ep?.season?.number ?? ep?.season_number ?? null;
    const ev = ep?.number ?? ep?.episode_number ?? null;
    const season = sv !== null && Number.isInteger(Number(sv)) ? Number(sv) : null;
    const episode = ev !== null && Number.isInteger(Number(ev)) ? Number(ev) : null;
    const rawTitle = props.title.name || props.title.title || props.title.original_name || "";
    return { title: cleanTitle(rawTitle).slice(0, 200), season, episode, episodeId: ep?.id != null ? String(ep.id) : null };
  }
  document.addEventListener("inertia:navigate", (event) => { if (event.detail?.page) currentPageData = event.detail.page; read(true); });
  document.addEventListener("inertia:success", (event) => { if (event.detail?.page) currentPageData = event.detail.page; read(true); });

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
    let season = null;
    let episode = null;
    const both = SEASON_EPISODE.exec(t);
    if (both) {
      season = Number(both[1]);
      episode = Number(both[2]);
      t = t.slice(0, both.index).trim();
    } else {
      const ep = EPISODE_ONLY.exec(t);
      if (ep && ep.index > 0) {
        episode = Number(ep[1]);
        t = t.slice(0, ep.index).trim();
      }
    }
    if (!t || /^(streaming\s*community|streamingcommunityz?)$/i.test(t)) return null;
    return { title: t.slice(0, 200), season, episode };
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

  /** Legge l'episodio attivo senza confondere un sottoinsieme di link con l'intera stagione. */
  function activeEpisodeInfo() {
    const episodeId = new URL(location.href).searchParams.get("e");
    if (!episodeId || !/^\d{1,12}$/.test(episodeId)) return null;

    const matching = [];
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        const url = new URL(link.href, location.href);
        if (url.origin === location.origin && url.pathname === location.pathname &&
            url.searchParams.get("e") === episodeId) matching.push(link);
      } catch {}
    }
    if (!matching.length) return null;

    // Preferisci il link che il sito marca come selezionato, evitando duplicati
    // presenti in menu desktop/mobile o in sezioni "prossimi episodi".
    const isActive = (el) => /active|current|selected/i.test(String(el.className ?? "")) ||
      el.getAttribute?.("aria-current") === "true" || el.getAttribute?.("aria-selected") === "true";
    matching.sort((a, b) => Number(isActive(b) || isActive(b.parentElement)) -
      Number(isActive(a) || isActive(a.parentElement)));
    const currentLink = matching[0];

    // Il numero esplicito sulla voce esatta ha sempre precedenza sull'ordine DOM.
    const explicitCandidates = [
      currentLink,
      currentLink.closest("li, [class*='episode' i], [class*='episodio' i], button"),
      currentLink.parentElement,
      currentLink.parentElement?.parentElement,
    ].filter(Boolean);
    for (const el of explicitCandidates) {
      const text = clean(el.textContent);
      if (text.length > 0 && text.length < 200) {
        const info = episodeNumber(text, true);
        if (info) return info;
      }
    }

    // Fallback ordinale: usa prima il vero elenco (UL/OL o contenitore dichiarato
    // come elenco episodi). Non scegliere il più piccolo antenato: spesso contiene
    // solo due/tre voci virtualizzate e produce numeri falsi dal 2° episodio in poi.
    const candidates = [];
    let ancestor = currentLink.parentElement;
    for (let depth = 0; ancestor && depth < 9; depth++, ancestor = ancestor.parentElement) {
      const links = [...ancestor.querySelectorAll("a[href]")];
      const episodeLinks = [];
      const seen = new Set();
      for (const link of links) {
        try {
          const url = new URL(link.href, location.href);
          const id = url.searchParams.get("e");
          if (url.origin !== location.origin || url.pathname !== location.pathname ||
              !id || !/^\d{1,12}$/.test(id) || seen.has(id)) continue;
          seen.add(id);
          episodeLinks.push({ link, id });
        } catch {}
      }
      const index = episodeLinks.findIndex((item) => item.id === episodeId);
      if (index < 0 || episodeLinks.length < 2 || episodeLinks.length > 100) continue;
      const className = String(ancestor.className ?? "");
      const semantic = /episode|episodi|season|stagion|playlist|accordion/i.test(className) ||
        ancestor.matches("ul, ol, [role='list']");
      const seasonMatches = [...clean(ancestor.textContent).matchAll(/(?:stagione|season)\s*(\d{1,3})/gi)]
        .map((match) => Number(match[1]));
      const distinctSeasons = new Set(seasonMatches);
      // Un contenitore con più stagioni non è una base valida per l'indice locale.
      if (distinctSeasons.size > 1) continue;
      candidates.push({
        index,
        count: episodeLinks.length,
        semantic,
        depth,
        season: seasonMatches[0] ?? null,
      });
    }

    const semanticLists = candidates.filter((item) => item.semantic);
    const usable = semanticLists.length ? semanticLists : candidates;
    if (!usable.length) return null;
    // Preferisci il contenitore semanticamente esplicito più vicino; in assenza
    // di semantica scegli quello completo con più voci, non il frammento più piccolo.
    usable.sort((a, b) => semanticLists.length
      ? a.depth - b.depth || b.count - a.count
      : b.count - a.count || a.depth - b.depth);
    const best = usable[0];
    return { season: best.season, episode: best.index + 1 };
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

  let lastDebugFingerprint = "";
  let lastDebugAt = 0;
  function debugSnapshot() {
    const episodeId = new URL(location.href).searchParams.get("e");
    const titleCandidates = [
      ["h1", document.querySelector("h1")?.textContent],
      ["og:title", document.querySelector('meta[property="og:title"]')?.content],
      ["twitter:title", document.querySelector('meta[name="twitter:title"]')?.content],
      ["itemprop:name", document.querySelector('meta[itemprop="name"]')?.content],
      ["data-title", document.querySelector("[data-title]")?.getAttribute("data-title")],
      ["document.title", document.title],
    ].filter(([, value]) => typeof value === "string" && value.trim())
      .map(([source, value]) => ({ source, value: clean(value).slice(0, 140) }));
    const episodeNodes = [...document.querySelectorAll(
      "h1,h2,h3,[class*=episode i],[class*=episodio i],li,a,button,[aria-current=true],[aria-selected=true]"
    )].slice(0, 180);
    const episodeTexts = episodeNodes.map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: String(el.className ?? "").slice(0, 100),
      text: clean(el.textContent).slice(0, 100),
      active: /active|current|selected/i.test(String(el.className ?? "")) ||
        el.getAttribute("aria-current") === "true" || el.getAttribute("aria-selected") === "true",
      episodeId: (() => { try { return new URL(el.href, location.href).searchParams.get("e"); } catch { return null; } })(),
    })).filter((item) => item.text || item.episodeId).slice(0, 35);
    const frames = [...document.querySelectorAll("iframe")].slice(0, 15).map((frame) => {
      try { return { origin: new URL(frame.src, location.href).origin, accessible: Boolean(frame.contentDocument) }; }
      catch { return { origin: "unavailable", accessible: false }; }
    });
    const v = findVideo();
    return {
      at: new Date().toISOString(),
      host: location.host,
      path: location.pathname,
      episodeId: episodeId && /^\d{1,12}$/.test(episodeId) ? episodeId : null,
      extracted: { title: known.title || null, season: known.season, episode: known.episode },
      inertia: (() => {
        const page = readInertiaPage(); const props = page?.props;
        return { present: Boolean(page), component: page?.component ?? null, hasTitle: Boolean(props?.title?.name), hasEpisode: Boolean(props?.episode), episodeId: props?.episode?.id != null ? String(props.episode.id) : null, season: props?.episode?.season?.number ?? props?.episode?.season_number ?? null, episode: props?.episode?.number ?? props?.episode?.episode_number ?? null };
      })(),
      titleCandidates,
      episodeTexts,
      counts: {
        h1: document.querySelectorAll("h1").length,
        episodeClass: document.querySelectorAll("[class*=episode i],[class*=episodio i]").length,
        links: document.querySelectorAll("a[href]").length,
        iframes: document.querySelectorAll("iframe").length,
        videos: document.querySelectorAll("video").length,
      },
      frames,
      playerVideo: v ? { duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null, readyState: v.readyState, paused: v.paused } : null,
    };
  }
  function sendDebug(force = false) {
    const snapshot = debugSnapshot();
    const fingerprint = JSON.stringify({ ...snapshot, at: null });
    const now = Date.now();
    if (!force && fingerprint === lastDebugFingerprint && now - lastDebugAt < 15000) return;
    lastDebugFingerprint = fingerprint;
    lastDebugAt = now;
    try { chrome.runtime.sendMessage({ type: "sc-debug", snapshot }).catch(() => {}); } catch {}
  }

  function read(force = false, forcedProgress = null) {
    sendDebug();
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
    const inertia = fromInertiaPage();
    if (inertia) {
      if (inertia.title) known.title = inertia.title;
      if (inertia.episodeId && inertia.episodeId === nextEpisodeId) {
        if (inertia.episode !== null) known.episode = inertia.episode;
        if (inertia.season !== null) known.season = inertia.season;
      }
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
    // L'URL SC contiene gia' l'ID provider dell'episodio: invialo anche se titolo,
    // numero e progresso non sono ancora leggibili (player cross-origin o DOM incompleto).
    if (!known.title && known.episode === null && progress === null && !known.episodeId) return;
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
