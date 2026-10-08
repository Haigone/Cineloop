// CineLoop: watch together.
//
// Runs on www.netflix.com after the user granted that site. While the user is
// in a CineLoop room (they hosted friends who joined, or joined a friend), it
// reports their player's position and play/pause state to the extension's
// background worker every 2 seconds, and applies a play or pause pressed by
// someone else in the room to this tab's video. It never seeks (Netflix does
// not allow it from outside its player), changes nothing else on the page and
// makes no request itself. Outside a room it only reports every few seconds,
// so the background can tell when a room starts.
(() => {
  if (globalThis.__cineloopParty) return;
  globalThis.__cineloopParty = true;

  /** The last room action applied here, so each play/pause is applied once. */
  let lastSeq = null;
  /** Our own play()/pause() fires events too: ignore them for a moment. */
  let applyingUntil = 0;
  let bound = null;

  const watchId = () => /^\/watch\/(\d{1,12})/.exec(location.pathname)?.[1] ?? null;
  const video = () => document.querySelector("video");

  function bind(v) {
    if (bound === v) return;
    bound = v;
    v.addEventListener("play", () => Date.now() > applyingUntil && report("play"));
    v.addEventListener("pause", () => Date.now() > applyingUntil && report("pause"));
  }

  async function report(action) {
    const id = watchId();
    const v = video();
    if (!id || !v) return;
    const res = await chrome.runtime
      .sendMessage({ type: "party-report", externalId: id, position: Math.round(v.currentTime * 10) / 10, paused: v.paused, ...(action ? { action } : {}) })
      .catch(() => null);
    if (res?.party) apply(res.party, v);
    else lastSeq = null;
  }

  function apply(party, v) {
    if (party.seq === lastSeq) return;
    lastSeq = party.seq;
    if (party.byYou || !party.sameEpisode) return;
    if (party.paused && !v.paused) {
      applyingUntil = Date.now() + 1500;
      v.pause();
    } else if (!party.paused && v.paused) {
      applyingUntil = Date.now() + 1500;
      v.play().catch(() => {});
    }
  }

  setInterval(() => {
    const v = video();
    if (!v || !watchId()) return;
    bind(v);
    report(null);
  }, 2000);
})();
