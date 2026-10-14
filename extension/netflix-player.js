// CineLoop: Netflix's own player, for watching together.
//
// Runs in the netflix.com page itself (the "MAIN" world), because Netflix's
// player object lives there and party-sync.js, as a content script, cannot
// see it. It does one thing: on a message from party-sync.js it asks
// Netflix's player to seek, play or pause, the way watch-party extensions
// such as Teleparty do. Setting the <video> element's currentTime instead
// breaks Netflix's player. It reads nothing, sends nothing anywhere and does
// nothing outside a CineLoop room: party-sync.js only asks while you are in one.
//
// This is Netflix's internal, undocumented player code: if Netflix changes it,
// it answers ok: false and party-sync.js falls back to reopening the episode
// at the right point with a `?t=` link.
(() => {
  if (window.__cineloopPlayer) return;
  window.__cineloopPlayer = true;

  function player() {
    try {
      const api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = api.getAllPlayerSessionIds();
      // The watch page's own session; previews on /browse have other ones.
      const id = ids.find((s) => s.startsWith("watch")) ?? ids[0];
      return id ? api.getVideoPlayerBySessionId(id) : null;
    } catch {
      return null;
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.cineloop !== "player") return;
    const { id, cmd, ms } = e.data;
    let ok = false;
    const p = player();
    if (p) {
      try {
        if (cmd === "seek" && Number.isFinite(ms) && ms >= 0) p.seek(Math.round(ms));
        else if (cmd === "play") p.play();
        else if (cmd === "pause") p.pause();
        else throw new Error("unknown");
        ok = true;
      } catch {
        ok = false;
      }
    }
    window.postMessage({ cineloop: "player-ack", id, ok }, location.origin);
  });
})();
