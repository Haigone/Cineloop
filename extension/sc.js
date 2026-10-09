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
    const res = await fetch(`${DIRECTORY_ORIGIN}/`, { credentials: "omit", redirect: "follow" });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchor.exec(html))) {
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!/streaming\s*community/i.test(label)) continue;
      try {
        const url = new URL(m[1], DIRECTORY_ORIGIN);
        if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        if (url.origin === DIRECTORY_ORIGIN) continue;
        const resolved = { origin: url.origin, at: Date.now() };
        await chrome.storage.local.set({ [RESOLVED_KEY]: resolved });
        return url.origin;
      } catch {
        // href non valido: prova il prossimo pulsante
      }
    }
  } catch {
    // directory irraggiungibile: resta sull'ultimo dominio noto
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
