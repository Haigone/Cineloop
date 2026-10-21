// AnimeUnity: dominio fisso, nessuna risoluzione da fare. Legge solo URL delle schede.

export const AU_ORIGIN = "https://www.animeunity.to";
export const AU_ORIGINS = ["https://www.animeunity.to/*", "https://animeunity.to/*"];
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
  return chrome.permissions.contains({ origins: AU_ORIGINS });
}

/** L'id numerico della pagina dell'anime (/anime/{id}-slug), o null. */
export function auWatchId(url) {
  return /\/anime\/(\d{1,9})(?:[-/?#]|$)/.exec(url || "")?.[1] ?? null;
}

/** True se l'URL appartiene ad AnimeUnity. */
export function isAnimeUrl(url) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && ["animeunity.to", "www.animeunity.to"].includes(parsed.hostname.toLowerCase()); } catch { return false; }
}
