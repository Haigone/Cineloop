// Reads only what the tab itself exposes to the browser UI: its URL and title.

export const NETFLIX_ORIGIN = "https://www.netflix.com/*";

/** The id in /watch/{id}, or null if this is not a playback page. */
export function watchId(url) {
  const m = /^https:\/\/www\.netflix\.com\/watch\/(\d{1,12})(?:[/?#]|$)/.exec(url || "");
  return m ? m[1] : null;
}

/** The show id of a title page or details panel (/title/{id} or ?jbv={id}). */
export function browseId(url) {
  try {
    const u = new URL(url || "");
    if (u.hostname !== "www.netflix.com") return null;
    const jbv = u.searchParams.get("jbv");
    if (jbv && /^\d{1,12}$/.test(jbv)) return jbv;
    const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?title\/(\d{1,12})/i.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function hasNetflixAccess() {
  return chrome.permissions.contains({ origins: [NETFLIX_ORIGIN] });
}
