// CineLoop: what is playing in this Netflix tab.
//
// Runs only on www.netflix.com, and only after the user granted that site to
// the extension. On a /watch page it reads two things that name what is on
// screen: the media metadata the page gives the browser (the same text shown
// in the browser's media controls) and the title line of the player. Nothing
// else on the page is read, nothing is changed, and no request is made: the
// result goes to the extension's own background worker.
(() => {
  if (globalThis.__cineloopPlayerTitle) return;
  globalThis.__cineloopPlayerTitle = true;

  const EPISODE = /(?:\bS|\bSt\.?|\bStagione|\bSeason|\bT)\s*(\d{1,3})\s*[:,.·-]?\s*(?:E|Ep\.?|Episodio|Episode)\s*(\d{1,4})/i;
  let last = "";

  function fromMediaSession() {
    const m = navigator.mediaSession?.metadata;
    if (!m?.title) return null;
    // Netflix puts the show in one field and "S4:E3 Episode name" in another, depending on version.
    const fields = [m.title, m.artist, m.album].filter(Boolean);
    const withEpisode = fields.find((f) => EPISODE.test(f));
    const show = fields.find((f) => !EPISODE.test(f)) ?? "";
    return { title: show, episodeText: withEpisode ?? "" };
  }

  function fromPlayer() {
    const box = document.querySelector('[data-uia="video-title"]');
    if (!box) return null;
    const show = box.querySelector("h4")?.textContent ?? "";
    const parts = [...box.querySelectorAll("span")].map((s) => s.textContent ?? "");
    const title = show || (parts.length === 0 ? box.textContent ?? "" : "");
    return { title, episodeText: parts.find((p) => EPISODE.test(p)) ?? "" };
  }

  function read() {
    const id = /^\/watch\/(\d{1,12})/.exec(location.pathname)?.[1];
    if (!id) return;
    const found = fromPlayer() ?? fromMediaSession();
    if (!found) return;
    const title = found.title.replace(/\s+/g, " ").trim().slice(0, 200);
    const ep = EPISODE.exec(found.episodeText);
    const info = { watchId: id, title, season: ep ? Number(ep[1]) : null, episode: ep ? Number(ep[2]) : null };
    if (!info.title) return;
    const key = JSON.stringify(info);
    if (key === last) return;
    last = key;
    chrome.runtime.sendMessage({ type: "player-title", ...info }).catch(() => {});
  }

  // Netflix is a single-page app and shows the title line only now and then,
  // so look again every few seconds; reading two elements is cheap.
  read();
  setInterval(read, 4000);
})();
