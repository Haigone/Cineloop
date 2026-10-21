// AnimeUnity cambia spesso TLD e hostname: riconosciamo la famiglia animeunity.<tld>.
// L'estensione legge solo gli host HTTPS autorizzati esplicitamente dall'utente.

export const AU_ORIGIN = "https://www.animeunity.to";
export const AU_ORIGINS = ["https://www.animeunity.to/*", "https://animeunity.to/*"];

export function isAnimeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /^(?:www\.)?animeunity\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(parsed.hostname);
  } catch { return false; }
}

export async function getAnimeOrigins() {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((origin) => {
    try {
      const parsed = new URL(origin.replace(/\/\*$/, "/"));
      return parsed.protocol === "https:" && /^(?:www\.)?animeunity\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(parsed.hostname);
    } catch { return false; }
  });
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
  return (await getAnimeOrigins()).length > 0;
}

/** L'id numerico della pagina dell'anime (/anime/{id}-slug), o null. */
export function auWatchId(url) {
  return /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(url || "")?.[1] ?? null;
}


