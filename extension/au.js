// AnimeUnity cambia spesso TLD e hostname: riconosciamo la famiglia animeunity.<tld>.
// L'estensione legge solo gli host HTTPS autorizzati esplicitamente dall'utente.

export const AU_DOMAIN = "animeunity.co";
export const AU_ORIGIN = `https://www.${AU_DOMAIN}`;
export const AU_ORIGINS = [`https://www.${AU_DOMAIN}/*`, `https://${AU_DOMAIN}/*`];

export function isAnimeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /^(?:[a-z0-9-]+\.)*animeunity(?:\.[a-z0-9-]{2,})+$/i.test(parsed.hostname);
  } catch { return false; }
}

export async function getAnimeOrigins() {
  const { origins = [] } = await chrome.permissions.getAll();
  // Firefox may expose the granted wildcard differently in getAll().contains()
  // is the authoritative check for the actual permission state.
  const broadAccess = await chrome.permissions.contains({ origins: ["https://*/*"] }).catch(() => false);
  const isAnimeOrigin = (origin) => {
    try {
      const parsed = new URL(origin.replace(/\/\*$/, "/"));
      return parsed.protocol === "https:" && /^(?:[a-z0-9-]+\.)*animeunity(?:\.[a-z0-9-]{2,})+$/i.test(parsed.hostname);
    } catch { return false; }
  };
  const known = origins.filter(isAnimeOrigin);
  // With the one-time all-HTTPS grant, remember the actual AnimeUnity origins
  // currently open. Never register a page script on unrelated sites.
  if (broadAccess) {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    for (const tab of tabs) {
      if (!tab.url || !isAnimeUrl(tab.url)) continue;
      try {
        const origin = new URL(tab.url).origin + "/*";
        if (!known.includes(origin)) known.push(origin);
      } catch {}
    }
  }
  return [...new Set(known)];
}
// Common VixCloud player hosts are requested in the same gesture as AnimeUnity,
// so the user does not have to approve the embed separately.
export const VIXCLOUD_ORIGINS = [
  "https://vixcloud.co/*",
  "https://www.vixcloud.co/*",
  "https://vixcloud.fun/*",
  "https://www.vixcloud.fun/*",
];
export const ANIMEUNITY_ACCESS_ORIGINS = [...AU_ORIGINS, ...VIXCLOUD_ORIGINS];
// AnimeUnity uses canonical anime pages like /anime/69-bleach, not /search?q=...
// Without AnimeUnity's numeric ID, open the archive rather than a broken search route.
export const AU_SEARCH = `${AU_ORIGIN}/anime/`;

export async function hasAnimeAccess() {
  if (await chrome.permissions.contains({ origins: ["https://*/*"] }).catch(() => false)) return true;
  return (await getAnimeOrigins()).length > 0;
}

/** L'id numerico della pagina dell'anime (/anime/{id}-slug), o null. */
export function auWatchId(url) {
  return /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(url || "")?.[1] ?? null;
}


