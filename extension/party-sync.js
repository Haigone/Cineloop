// CineLoop: watch together on Netflix, Prime Video, AnimeUnity and StreamingCommunity.
//
// Runs on www.netflix.com after the user granted that site. While the user is
// in a CineLoop room (they hosted friends who joined, or joined a friend), it
// reports their player's position and play/pause state to the extension's
// background worker every 2 seconds and keeps this tab on the room's clock:
//
// - play and pause pressed by anyone in the room are applied here;
// - a gap of 2 s or more (a friend who just joined, someone who moved the bar)
//   is closed by asking Netflix's own player to seek, through netflix-player.js,
//   as Teleparty does; a gap of 1 to 2 s by playing a little faster or slower
//   (the <video> element's playbackRate), so nobody sees a jump;
// - if Netflix's player does not answer (Netflix changed it), a big gap reopens
//   the same episode at the room's point with Netflix's own `?t=` link. Netflix
//   breaks when a page sets the video's currentTime, so this never does that.
//
// On Prime Video there is no player to ask and no `?t=` link: play, pause and
// seeks go through the <video> element itself, and the position is the one
// Prime's own time bar shows (prime-page.js reads it), so an ad break before
// one member's episode does not put them out of step. While an ad plays
// nothing is reported or applied.
//
// The room follows the host's player; a member's own play, pause or seek moves
// it for everyone. It makes no request itself. Outside a room it only reports
// every few seconds, so the background can tell when a room starts.
(() => {
  // As in player-title.js: a copy from an earlier version of the extension is dead.
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  if (typeof globalThis.__cineloopParty === "function" && globalThis.__cineloopParty()) return;
  let stopped = false;
  globalThis.__cineloopParty = () => !stopped && alive();

  /** Beyond this gap (seconds) Netflix's player is asked to seek to the room's point... */
  const SEEK_SECONDS = 2;
  /** ...and, if it cannot, beyond this one the episode is reopened there. */
  const JUMP_SECONDS = 8;
  /** Beyond this gap the player speeds up or slows down until it is back in step... */
  const NUDGE_SECONDS = 1;
  /** ...within this. */
  const SETTLED_SECONDS = 0.3;
  /** Reopening the page takes a few seconds: aim that far ahead when the room is playing. */
  const JUMP_LEAD = 5;
  const JUMP_KEY = "cineloop-party-jump";

  /** Our own play()/pause() fire events too: ignore them for a moment. */
  let applyingUntil = 0;
  let bound = null;
  let boundAt = 0;
  /** Each report is numbered; answers to reports older than the last own action are stale. */
  let sent = 0;
  let freshFrom = 0;
  /** Was this player in step with the room at the last check? Only then is a seek here the user's. */
  let inStep = false;
  /** Has this player had the room's state since it appeared? */
  let heard = false;
  /** Was it too far from the room at the last check (still catching up)? */
  let lagging = false;
  let nudging = false;

  const isVixCloudPlayerFrame = () =>
    window !== window.top &&
    location.hostname !== "www.netflix.com" &&
    location.hostname !== "www.animeunity.so" &&
    /^\/playlist\/\d+(?:\/|$)/i.test(location.pathname);
  const onPrime = location.hostname === "www.primevideo.com" || location.hostname === "www.amazon.it";
  const provider = () => {
    if (location.hostname === "www.netflix.com") return "netflix";
    if (onPrime) return "prime-video";
    if (location.hostname === "www.animeunity.so" || isVixCloudPlayerFrame()) return "animeunity";
    return "streamingcommunity";
  };
  let playerFrameContext = null;
  let playerFrameContextAt = 0;
  async function getPlayerFrameContext() {
    if (!isVixCloudPlayerFrame()) return null;
    if (playerFrameContext && Date.now() - playerFrameContextAt < 3000) return playerFrameContext;
    playerFrameContext = await chrome.runtime.sendMessage({ type: "party-context" }).catch(() => null);
    playerFrameContextAt = Date.now();
    return playerFrameContext;
  }
  /** Prime Video: what prime-page.js reads from the open player (null when closed or in an ad). */
  const primeNow = () => {
    const now = typeof globalThis.__cineloopPrimeNow === "function" ? globalThis.__cineloopPrimeNow() : null;
    return now && !now.ad ? now : null;
  };
  /**
   * Prime Video: seconds between the <video> clock and the episode's own time
   * (Prime's time bar). They differ, by ads and by how Prime builds the
   * stream, so positions are exchanged in the episode's time. Kept while it
   * stays within a second and a half of the bar, so it does not jitter.
   */
  let offset = 0;
  function primeOffset(now) {
    if (now.shown === null) return offset;
    const seen = now.video.currentTime - now.shown;
    if (Math.abs(seen - offset) > 1.5) offset = Math.round(seen * 10) / 10;
    return offset;
  }
  const watchId = () => {
    if (provider() === "prime-video") return primeNow()?.watchId ?? null;
    if (provider() === "netflix") return /^\/watch\/(\d{1,12})/.exec(location.pathname)?.[1] ?? null;
    if (provider() === "animeunity") {
      const url = new URL(location.href);
      url.searchParams.delete("cineloopResume");
      return url.toString();
    }
    if (provider() === "streamingcommunity") {
      const url = new URL(location.href);
      url.hash = "";
      return url.toString();
    }
    const m = /\/(?:titles?\/(\d{1,9})|(?:[a-z]{2}\/)?watch\/(\d{1,9}))(?:[-/?#]|$)/i.exec(location.pathname);
    return m?.[1] ?? m?.[2] ?? null;
  };
  // Ignore hidden ad/stale videos: they can have a different duration and
  // clock from the episode actually visible to the user.
  const video = () => {
    if (onPrime) return primeNow()?.video ?? null;
    const candidates = [...document.querySelectorAll("video")]
      .filter((v) => v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0)
      .map((v) => {
        const rect = v.getBoundingClientRect();
        const style = getComputedStyle(v);
        const visible = rect.width >= 160 && rect.height >= 90 &&
          rect.bottom > 0 && rect.right > 0 &&
          rect.top < window.innerHeight && rect.left < window.innerWidth &&
          style.display !== "none" && style.visibility !== "hidden" &&
          Number(style.opacity || 1) > 0.05;
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        const playing = !v.paused && !v.ended && v.readyState >= 2;
        return {
          video: v,
          score: (visible ? 1_000_000_000_000 : 0) +
            (playing ? 10_000_000_000 : 0) +
            (v.readyState >= 3 ? 100_000_000 : 0) +
            Math.min(area, 5_000_000) +
            Math.min(Math.max(0, v.currentTime || 0), 100_000),
        };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.video ?? null;
  };
  const own = () => Date.now() > applyingUntil;

  // Netflix's player, through netflix-player.js in the page. Answers false when
  // it is not there (or Netflix changed it); then the <video> element is used.
  let asked = 0;
  const waiting = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.cineloop !== "player-ack") return;
    waiting.get(e.data.id)?.(e.data.ok === true);
    waiting.delete(e.data.id);
  });
  function netflixPlayer(cmd, ms) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${++asked}`;
      waiting.set(id, resolve);
      window.postMessage({ cineloop: "player", id, cmd, ...(ms === undefined ? {} : { ms }) }, location.origin);
      setTimeout(() => waiting.delete(id) && resolve(false), 800);
    });
  }

  function bind(v) {
    if (bound === v) return;
    bound = v;
    boundAt = Date.now();
    inStep = false;
    heard = false;
    lagging = false;
    nudging = false;
    // Netflix starts, and seeks, by itself while the episode loads: only what
    // happens after this player has heard from the room counts as the user's.
    const settled = () => own() && heard && Date.now() - boundAt > 5000;
    v.addEventListener("play", () => settled() && report("play"));
    v.addEventListener("pause", () => settled() && report("pause"));
    // The user moved the bar (or used ← →): only from a player that was in step.
    v.addEventListener("seeked", () => settled() && inStep && report("seek"));
  }

  async function report(action) {
    const v = video();
    if (!v || !alive()) return;
    // AnimeUnity's actual <video> lives on VixCloud's cross-origin playlist
    // frame. Ask the background for the parent AnimeUnity URL; never guess an ID.
    const frameContext = isVixCloudPlayerFrame() ? await getPlayerFrameContext() : null;
    const id = frameContext?.externalId ?? watchId();
    if (!id) return;
    const now = onPrime ? primeNow() : null;
    if (onPrime && (!now || now.video !== v)) return;
    const shift = now ? primeOffset(now) : 0;
    const where = now
      ? { season: now.season ?? null, episode: now.episode ?? null }
      : frameContext
        ? { season: frameContext.season ?? null, episode: frameContext.episode ?? null }
        : {};
    const n = ++sent;
    if (action) freshFrom = n;
    const t0 = performance.now();
    const res = await chrome.runtime
      .sendMessage({ type: "party-report", externalId: id, ...where, position: Math.max(0, Math.round((v.currentTime - shift) * 100) / 100), duration: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null, paused: v.paused, following: heard && !lagging, ...(action ? { action } : {}) })
      .catch(() => null);
    if (n < freshFrom) return;
    if (res?.party) apply(res.party, v, (performance.now() - t0) / 1000, shift);
    else relax(v);
  }

  /** Not in a room (any more): give the player back its normal speed. */
  function relax(v) {
    inStep = false;
    heard = false;
    setRate(v, 1);
  }

  function setRate(v, rate) {
    if (rate === 1 && !nudging) return;
    nudging = rate !== 1;
    try {
      v.playbackRate = rate;
    } catch {}
  }

  /** `shift`: the <video> clock minus the episode's time (Prime Video), else 0. */
  async function apply(party, v, rtt, shift = 0) {
    if (!party.sameEpisode) return relax(v);
    heard = true;
    if (party.paused !== v.paused) {
      applyingUntil = Date.now() + 1500;
      if (provider() !== "netflix" || !(await netflixPlayer(party.paused ? "pause" : "play"))) {
        if (party.paused) v.pause();
        else v.play().catch(() => {});
      }
    }
    // The room's clock was read on the server, about half a round trip ago.
    const target = party.position + (party.paused ? 0 : rtt / 2);
    const gap = v.currentTime - shift - target;
    inStep = Math.abs(gap) < 3;
    lagging = Math.abs(gap) >= SEEK_SECONDS;
    if (Math.abs(gap) >= SEEK_SECONDS) {
      setRate(v, 1);
      // Our own seek fires "seeked" too: it is not the user's.
      applyingUntil = Date.now() + 2500;
      if (provider() === "netflix" && await netflixPlayer("seek", Math.round(target * 1000))) return;
      if (provider() !== "netflix") {
        try {
          v.currentTime = Math.max(0, target + shift);
          applyingUntil = Date.now() + 2500;
          return;
        } catch {}
      }
      applyingUntil = 0;
      if (provider() === "netflix" && Math.abs(gap) >= JUMP_SECONDS) return jump(v, target + (party.paused ? 0 : JUMP_LEAD));
    }
    if (party.paused) return setRate(v, 1);
    if (Math.abs(gap) >= NUDGE_SECONDS) setRate(v, gap > 0 ? 0.8 : 1.25);
    else if (Math.abs(gap) < SETTLED_SECONDS || !nudging) setRate(v, 1);
  }

  /** Reopens this episode at `seconds`, unless that was just tried. */
  function jump(v, seconds) {
    setRate(v, 1);
    let last = null;
    try {
      last = JSON.parse(sessionStorage.getItem(JUMP_KEY) ?? "null");
    } catch {}
    if (last?.failed) return;
    if (last && Date.now() - last.at < 60_000) {
      // Still far from where we asked to start: Netflix ignored `t`. Stop trying
      // in this tab; the popup tells the user how far the room is.
      if (Math.abs(v.currentTime - last.t) > 60) store({ ...last, failed: true });
      if (Date.now() - last.at < 15_000) return;
    }
    const t = Math.max(0, Math.floor(seconds));
    store({ at: Date.now(), t });
    const url = new URL(location.href);
    url.searchParams.set("t", String(t));
    location.assign(url.toString());
  }

  function store(value) {
    try {
      sessionStorage.setItem(JUMP_KEY, JSON.stringify(value));
    } catch {}
  }

  const timer = setInterval(() => {
    if (!alive()) {
      stopped = true;
      return clearInterval(timer);
    }
    const v = video();
    if (!v || (!watchId() && !isVixCloudPlayerFrame())) return;
    bind(v);
    report(null);
  }, 2000);
})();
