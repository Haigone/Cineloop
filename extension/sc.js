// StreamingCommunity: risolve il dominio attuale e legge solo URL e titolo delle schede.
//
// Il dominio di StreamingCommunity cambia spesso: il link aggiornato e' sul
// pulsante "StreamingCommunity" di https://www.streaming-community.how/.
// Questo modulo lo recupera (una volta ottenuto il permesso per quel sito),
// lo tiene in cache per qualche ora e riconosce le pagine titolo/riproduzione.

export const DIRECTORY_ORIGIN = "https://www.streaming-community.how";
export const DIRECTORY_ORIGINS = ["https://www.streaming-community.how/*"];

const RESOLVED_KEY = "scResolved";
const CACHE_MS = 6 * 60 * 60 * 1000; // il dominio dura giorni: risolvi al massimo ogni 6 ore

export async function hasDirectoryAccess() {
  return chrome.permissions.contains({ origins: DIRECTORY_ORIGINS });
}

/** { origin, at } del dominio StreamingCommunity piu' recente, o null. */
export async function getResolved() {
  const { [RESOLVED_KEY]: resolved = null } = await chrome.storage.local.get(RESOLVED_KEY);
  return resolved;
}

/** True se l'estensione puo' leggere le schede del dominio risolto. */
export async function hasStreamingAccess() {
  const resolved = await getResolved();
  if (!resolved?.origin) return false;
  try {
    return await chrome.permissions.contains({ origins: [`${resolved.origin}/*`] });
  } catch {
    return false;
  }
}

/** Recognize the domain only from a watch URL the user has opened themselves. */
export function streamingOriginFromWatchUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\\./, "");
    const validHost = /^(?:streaming[-]?community[a-z0-9-]*|streamingcommunityz[a-z0-9-]*)\\.[a-z]{2,}$/i.test(host);
    const validPath = /^\\/(?:[a-z]{2}\\/)?watch\\/\\d{1,9}(?:\\/|$)/i.test(url.pathname) ||
      /^\\/titles?\\/\\d{1,9}(?:[-/?#]|$)/i.test(url.pathname);
    if (url.protocol !== "https:" || url.username || url.password || url.origin === DIRECTORY_ORIGIN || !validHost || !validPath) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Remember a changed origin observed in the user's own StreamingCommunity watch
 * tab. This does not visit or crawl any replacement domain. Chrome still
 * requires the user to grant host access before page contents can be read.
 */
export async function rememberObservedStreamingUrl(value) {
  const origin = streamingOriginFromWatchUrl(value);
  if (!origin) return null;
  const current = await getResolved();
  if (current?.origin !== origin) {
    await chrome.storage.local.set({ [RESOLVED_KEY]: { origin, at: Date.now() } });
  }
  return origin;
}

/**
 * Apre la directory e segue il pulsante "StreamingCommunity". Senza permesso
 * per la directory, o se la directory e' irraggiungibile, torna l'ultimo
 * dominio noto. In un service worker non c'e' DOMParser: l'HTML si scandisce
 * con un'espressione regolare sugli <a>.
 */
export async function resolveStreamingUrl({ force = false } = {}) {
  const cached = await getResolved();
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.origin;
  if (!(await hasDirectoryAccess())) return cached?.origin ?? null;
  try {
    const res = await fetch(DIRECTORY_ORIGIN + "/", { credentials: "omit", redirect: "follow" });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchor.exec(html))) {
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!/streaming\s*community/i.test(label)) continue;
      try {
        const target = new URL(m[1], res.url || DIRECTORY_ORIGIN);
        if (target.protocol !== "https:" || target.origin === DIRECTORY_ORIGIN || !/streaming[-]?community/i.test(target.hostname)) continue;

        // The directory button may redirect to another host. Resolve that
        // redirect with a temporary inactive tab; fetch() would require the
        // destination host permission before it could follow the redirect.
        const tab = await chrome.tabs.create({ url: target.href, active: false });
        let finalUrl = null;
        try {
          finalUrl = await new Promise((resolve) => {
            let finished = false;
            let timeout;
            const finish = (value) => {
              if (finished) return;
              finished = true;
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(onUpdated);
              resolve(value);
            };
            const onUpdated = (tabId, change, updated) => {
              if (tabId === tab.id && change.status === "complete") finish(updated.url || null);
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
            timeout = setTimeout(() => finish(null), 12000);
            chrome.tabs.get(tab.id).then((current) => {
              if (current.status === "complete") finish(current.url || null);
            }).catch(() => finish(null));
          });
        } finally {
          if (tab.id !== undefined) await chrome.tabs.remove(tab.id).catch(() => {});
        }
        const final = new URL(finalUrl || target.href);
        if (final.protocol !== "https:" || !/streaming[-]?community/i.test(final.hostname)) continue;
        const resolved = { origin: final.origin, at: Date.now() };
        await chrome.storage.local.set({ [RESOLVED_KEY]: resolved });
        return resolved.origin;
      } catch {
        // Invalid link or redirect: try the next StreamingCommunity button.
      }
    }
  } catch {
    // Directory unavailable: keep the last known host.
  }
  return cached?.origin ?? null;
}

/** L'id numerico della pagina titolo (/titles/{id}-slug), o null. */
export function scWatchId(url) {
  const m = /\/titles?\/(\d{1,9})(?:[-/?#]|$)/.exec(url || "");
  if (m) return m[1];
  try {
    const u = new URL(url || "");
    const id = u.searchParams.get("title_id") ?? u.searchParams.get("titleId") ?? u.searchParams.get("id");
    return id && /^\d{1,9}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** True se l'URL appartiene al dominio StreamingCommunity risolto. */
export async function isStreamingUrl(url) {
  const resolved = await getResolved();
  if (!resolved?.origin || !url) return false;
  try {
    return new URL(url).origin === resolved.origin;
  } catch {
    return false;
  }
}
