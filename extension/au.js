// AnimeUnity: dominio fisso, nessuna risoluzione da fare. Legge solo URL delle schede.

export const AU_ORIGIN = "https://www.animeunity.so";
export const AU_ORIGINS = ["https://www.animeunity.so/*"];
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
  return typeof url === "string" && url.startsWith(`${AU_ORIGIN}/`);
}
